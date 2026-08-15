# 单词文本批量导入 + 免费 TTS 听写 — 实施计划

日期：2026-08-15
Spec：`docs/superpowers/specs/2026-08-15-text-import-tts-dictation-design.md`

## 步骤

1. **数据层**：`db/schema.sql` 与 `worker/src/db.ts` 同步（`defaultSchema` words 表加 `definition` 列；`applySchema` 加 PRAGMA 幂等 ALTER 迁移；`Word` 接口加 `definition`）。
2. **后端**：`worker/src/index.ts` 新增 `POST /api/units/:unitId/words/bulk`（校验、去重、批量插入），`worker/src/index.test.ts` 补测试。
3. **解析器**：`src/lib/textImport.ts` + `textImport.test.ts`。
4. **TTS hook**：`src/hooks/useSpeechSynthesis.ts` + 测试（mock speechSynthesis）。
5. **前端 API**：`src/api/admin.ts` 加 `bulkImportWords`。
6. **导入抽屉**：`DictationImportDrawer.tsx` 加「文本导入」页签（textarea + 实时解析预览 + 导入），更新其测试。
7. **管理后台**：`DictationAdmin.tsx` 词条徽标（TTS/音频）+ TTS 试听，更新其测试。
8. **听写练习**：`Practice.tsx` 播放抽象（audio / TTS 分支）、判分展示释义、语音/语速控件。
9. **样式**：`src/styles.css` 追加 `.import-tabs` / `.import-preview` / `.tts-badge` / `.voice-controls` 等。
10. **校验**：`npm test`、`npx tsc --noEmit`、`npm run build` 全绿。

## 验收

- 文本导入：粘贴单元单词（含纯单词/带释义/错误行），预览正确、导入成功、词条标 TTS。
- 听写：TTS 词条朗读、自动序列、5 秒间隔、判分/错词重练与音频一致；语音/语速可调。
- 音频词条回归不受影响；迁移幂等。
