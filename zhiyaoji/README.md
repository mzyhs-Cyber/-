# 知遥集 · 江苏省考刷题网站

跨对话开发入口。先读 [PROJECT_STATE.md](PROJECT_STATE.md)、[ACTIVE_TASK.md](ACTIVE_TASK.md)，再读 [AGENTS.md](AGENTS.md) 和本工单涉及的代码。测试按 [TEST_MATRIX.md](TEST_MATRIX.md) 执行。

## 当前身份

- 本仓库存放用户提供的 **V2.9.18 修正版7，build 20261021-r7** 代码快照。
- **当前线上正式基线、实际部署版本、题库发布版本均未知。** 附件身份不等于线上验收结果，也不能与 R8 系列自行合并。
- 本次只建立开发档案与资产归档，没有修复业务、改变存储结构或部署线上。
- `app/` 的 22 个文件与附件逐字节一致。私人 `birthday.html`（照片、信件）和完整学习备份未提交；当前树不是包含所有私人素材的完整部署包。

## 目录

| 路径 | 用途 |
| --- | --- |
| `app/` | 原样保留的部署代码、样式、图标、配置、Worker |
| `docs/SOURCE_MANIFEST.json` | 附件来源、逐文件 SHA-256、排除项 |
| `docs/DATA_CONTRACT.json` | 备份字段结构与数量，不含题目、记录或身份值 |
| `scripts/verify_project.py` | 代码快照、入口资源、语法、敏感内容检查 |
| `scripts/package_deploy.py` | 在本地补齐原私人素材后组装 ZIP，不上传或部署 |
| `verification/RESULTS.json` | 本次实际执行的检查结果 |
| `DECISIONS.md` / `CHANGELOG.md` | 决策与有证据的版本记录 |
| `HANDOFF.md` / `BACKLOG.md` | 下一步与未处理发现 |

本地检查：`python3 scripts/verify_project.py`。需要 Node.js；不安装应用依赖，不写浏览器数据库，不请求线上账号接口。

本地静态预览可用 `python3 -m http.server 8080 --directory app`。它不提供 Cloudflare Worker/D1/R2，不能据此验收账号同步。不要在生产账号或真实学习数据上做恢复测试。
