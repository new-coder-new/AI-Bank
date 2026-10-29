// ==========================================================================
//  本地密钥配置模板
//  用法：复制本文件为 js/config.local.js，再填入自己的真实 Key
//        js/config.local.js 已被 .gitignore 忽略，不会提交到仓库
//  说明：Key 也可由服务端环境变量注入（server/index.js 读取 DEEPSEEK_API_KEY /
//        SILICONFLOW_API_KEY，在缺少 config.local.js 时生成同结构的配置）
// ==========================================================================
window.__BANK_KEYS__ = {
  // DeepSeek：对话、意图分类、Agent function calling
  deepseekApiKey: 'sk-在此填入你的 DeepSeek API Key',
  // 硅基流动：语音识别（可留空，此时语音输入自动走模拟识别）
  siliconflowApiKey: 'sk-在此填入你的 SiliconFlow API Key'
};
