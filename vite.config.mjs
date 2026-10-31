// Vite 构建：不重写现有「经典脚本 + 全局」结构，只负责
//   ① 开发服务器（/api 代理到本地银行核心）
//   ② 生产构建：逐文件 esbuild 压缩 + 内容 hash，index.html 自动引用新文件
//   ③ 去掉手写的 ?v= 版本号（hash 自动解决缓存）
import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';

const ROOT = process.cwd();
const JS_DIRS = ['build/js'];

/** 收集 js/ 下所有 .js（跳过 config.local.js，它是服务端动态下发的） */
function collectJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectJs(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 生产构建插件：压缩 + hash + 重写 index.html */
function classicScriptsBuild() {
  return {
    name: 'classic-scripts-build',
    apply: 'build',
    closeBundle() {
      const distDir = join(ROOT, 'dist');
      const assetsDir = join(distDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });

      const map = new Map(); // /js/xx.js -> /assets/xx.hash.js
      for (const dir of JS_DIRS) {
        if (!existsSync(join(ROOT, dir))) continue;
        for (const file of collectJs(join(ROOT, dir))) {
          const rel = '/' + relative(ROOT, file).split('\\').join('/');
          if (rel.endsWith('config.local.js')) continue; // 服务端动态路由，保留原路径
          const src = readFileSync(file, 'utf8');
          let out;
          try {
            out = transformSync(src, { loader: 'js', minify: true, target: 'es2020' }).code;
          } catch (e) {
            out = src; // 压缩失败则原样输出，不阻塞构建
          }
          const hash = createHash('sha256').update(out).digest('hex').slice(0, 8);
          const base = rel.replace(/^\/build\/js\//, '').replace(/\.js$/, '');
          const outRel = `/assets/${base}.${hash}.js`;
          const outPath = join(distDir, outRel.slice(1));
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, out, 'utf8');
          // 同时保留原始路径（内容已压缩）：即使 index.html 仍引用 js/xxx.js 也能直接跑
          const samePath = join(distDir, rel.slice(1));
          mkdirSync(dirname(samePath), { recursive: true });
          writeFileSync(samePath, out, 'utf8');
          map.set(rel, outRel);
        }
      }

      // 重写 index.html：替换 script src、去掉 ?v=
      const htmlPath = join(distDir, 'index.html');
      if (!existsSync(htmlPath)) return;
      let html = readFileSync(htmlPath, 'utf8');
      html = html.replace(/<script([^>]*?)src="([^"]+?\.js)(\?[^"]*)?"([^>]*)>/g, (m, pre, src, q, post) => {
        const hit = map.get(src);
        return '<script' + pre + 'src="' + (hit || src) + '"' + post + '>';
      });
      html = html.replace(/\?v=[0-9a-zA-Z]+/g, '');
      writeFileSync(htmlPath, html, 'utf8');
      console.log('[build] 已压缩并 hash ' + map.size + ' 个脚本');
    }
  };
}

export default defineConfig({
  root: ROOT,
  publicDir: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: { app: join(ROOT, 'index.html') }
    }
  },
  plugins: [classicScriptsBuild()]
});
