# vercel-proxy — AI 文章分析代理服务

SeventEnglish 的 AI 分析能力由 Cloudflare Worker 迁移到此 Vercel Serverless 服务执行。

## 为什么需要它

Cloudflare Workers **免费计划** CPU 限制为 10ms/请求，而 AI 文章分析（SSE 流解析 + JSON 校验）实际需要约 2 秒 CPU，导致线上分析任务被平台以 `exceededCpu` 终止、状态永久卡在 `processing`。本服务把 AI 调用移到 Vercel（Hobby 函数最长 300s，无 10ms CPU 硬限制），Worker 只负责转发请求与入库，绕过该限制。

## 接口

```
POST /api/analyze
Authorization: Bearer <ANALYZE_TOKEN>

{
  "title": "文章标题",
  "content": "文章全文",
  "baseUrl": "https://api.siliconflow.cn/v1",
  "model": "deepseek-ai/DeepSeek-V4-Flash",
  "apiKey": "sk-..."
}

成功: 200 { "ok": true, "analysis": ArticleAnalysis }
失败: 4xx/5xx { "ok": false, "error": "..." }
```

- `apiKey` 由 Worker 从 D1 解密后随请求传入（HTTPS 传输），本服务不会将其写入日志。
- `ANALYZE_TOKEN` 环境变量与管理后台「设置 → AI 分析服务」中配置的 Token 保持一致，防止接口被他人滥用。

## 部署

1. 在 [Vercel](https://vercel.com) 新建项目，导入本仓库后把 **Root Directory 指向 `vercel-proxy`**（或使用 Vercel CLI 在 `vercel-proxy/` 目录执行 `vercel`）。
2. 在项目 Settings → Environment Variables 添加：
   - `ANALYZE_TOKEN`：一段足够长的随机字符串（如 `openssl rand -hex 32`），**务必与管理后台配置的 Token 一致**
3. 部署后得到形如 `https://xxx.vercel.app` 的地址。
4. 打开 SeventEnglish 管理后台 →「设置」→「AI 分析服务」，填写 Vercel 地址与 Token 并保存。

## 限制与说明

- Vercel Hobby 函数最长 300s，本服务内 AI 调用超时设 280s；超长文章（AI 生成超过约 4.5 分钟）可能超时失败，重新触发分析即可。
- 本文件的解析/校验逻辑与 `worker/src/articleAnalysis.ts` 保持同步，修改时两处需一起改。
- 函数按需冷启动，首次调用可能有数秒延迟（可接受）。
