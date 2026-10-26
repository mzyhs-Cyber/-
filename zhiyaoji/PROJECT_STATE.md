# PROJECT_STATE

更新日期：2026-10-26（北京时间）。证据仅来自本次附件、实际读取的仓库元数据和代码；未重整历史聊天或旧 ZIP。

## 身份与盘点

| 项目 | 已核实状态 |
| --- | --- |
| 既有仓库 | `mzyhs-Cyber/-`，公开，默认 `main`，读取时 HEAD `48a3aa7e16f2fccaf3e0ab1772903e73c4618e65` |
| 既有仓库内容 | 粉笔采集工具及旧交接资料；无本项目六份入口档案；未覆盖或删除其中的文件 |
| 原工作目录 | 不是有效 Git 工作树，无可核实的已跟踪未提交修改；本次资产在独立目录整理 |
| 本次代码快照 | 附件 V2.9.18 修正版7；`S.VERSION=2.9.18`、`S.BUILD=20261021-r7`、首页与 SW 标记 r7 |
| 正式修改基线 | **未知**。当前只归档附件，禁止据此自动替换线上或 R8 系列 |
| 实际线上部署 | **未知**。附件说明指定 Cloudflare Pages 项目 `jiangsu-study-mzy-sync`，本次未读取部署控制台；公开地址读取未成功 |
| 题库发布版本 | **未知**。配置指向 `https://jiangsu-study-bank-mzy.pages.dev/`，地址不是版本号，也不代表已经具备访问控制 |
| 本次备份 | schema 3、标称 app 2.9.18、导出于 2026-10-22；25647 题、223 卷、44 练习、655 作答，仅代表该导出 |
| 上传完整性 | 原 ZIP 23 个文件；22 个代码/配置文件原样保留，1 个私人素材排除，见清单 |

本项目归档目的地：`mzyhs-Cyber/-` 的独立分支 `zhiyaoji-handoff-20261026`，目录 `zhiyaoji/`。原 main 与既有文件不改；本次不建立私人仓库，公开分支仅上传排除私人内容后的代码和档案。

## 架构与代码定位

无已提供的模块源码、package.json、原构建流水线或独立数据库迁移脚本。`bundle.js` 是可读的交付代码，不能宣称具备原工程的可复现构建。

| 位置 | 职责 |
| --- | --- |
| `app/index.html`、四个 CSS、PWA 图标/manifest | 页面入口、样式和安装外壳 |
| `app/bundle.js` 719 行附近 | 稳定核心、schema 3 数据、导入/查重/备份恢复 |
| 同文件 1356 行附近 | InkLayer；2873～3333 行附近为笔记模型、投影、输入与材料切换 |
| 同文件 3501 / 3631 / 3736 行附近 | 学习记录三方合并、无损传输图、独立笔记 depot |
| 同文件 4340 行以后 | 提交证据、复盘笔记、导出及 depot 集成 |
| `app/_worker.js` | 同源账号与同步 API；D1 元数据、R2 笔记对象 |
| `app/sw.js` | 页面外壳缓存，排除题库资源和账号 API |
| `app/storage-check.*`、`performance-diagnostics.js` | 存储/同步检查与诊断；诊断文件本身不等于测试已通过 |

本地主库名 `mzy-study-clean-v2`，IndexedDB version **2**，stores 为 `cold/hot/meta/state`；应用/备份 schema **3** 是另一层版本，不要混淆。辅助库为 `zhiyaoji-note-depot-v1`（objects）和 `mzy-study-sync-profiles-v1`（profiles）。

## 部署与题库

Cloudflare Pages 高级模式 `_worker.js` + 静态资源；`_routes.json` 将 `/api/*` 送 Worker。绑定名：`STUDY_SYNC_DB`（D1）、`STUDY_NOTES`（R2）、`STUDY_INVITE_CODE`（私人注册口令）、`ASSETS`（平台静态资源）。实际绑定值、账号、数据库 ID、桶权限均未知且不写入 Git。

Worker 含 `ensureV2` 的增量表创建逻辑，但依赖的初始账号表迁移未提供。不得猜测并在生产执行建库。部署根层需要 `index.html`，不是仓库根直接整体上传；先按脚本在本地补齐私人资源并打包。

题库由独立地址导入/缓存，V2 外部格式与内部 schema 3 不等同。逐题、试卷、练习、作答字段名见 `docs/DATA_CONTRACT.json`。不把题库、个人记录、会话身份值或恢复码提交 Git。私人题库站点的真实鉴权状况尚未验证，不能声称已经私有。

## 边界

当前工单只做持续开发档案与资产归档。正式基线、R8 与 V2 的关系以及线上题库版本待核实；任何功能修改先单独立工单。历史作答、收藏、错题、草稿、InkLayer、媒体、导入、查重、备份恢复均禁止未经回归改变。
