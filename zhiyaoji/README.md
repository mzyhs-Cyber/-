# 知遥集 · 开发与训练接续入口

先读[现行执行规则](docs/OPERATING_RULES.md)、[连续性入口](docs/CONTINUITY.md)、[反馈台账](docs/FEEDBACK_LOG.md)，再读[开发约束](AGENTS.md)、[当前状态](PROJECT_STATE.md)、[当前工单](ACTIVE_TASK.md)。本工单代码与测试按需读取。

## 当前身份

- 当前开发分支fix/zhiyaoji-r8-8-17，业务代码R8.8.27，PR #7。网站代码位于app/；本次规则文档更新不升级业务版本。
- 本会话R17—R27未部署。线上具体版本、用户自行部署情况与iPad验收须另核实，不能由Git提交推定。
- r7来源清单与zhiyaoji-handoff-20261026是历史归档，保留用于追溯；app/已非原r7逐字节快照。
- 公开代码不含真实题库、个人备份、笔迹正文或私人birthday.html。完整部署包由本地补齐原私人素材后打包，禁止占位素材。
- 江苏模型研究在feature/jiangsu-specialty-system-v1分支的jiangsu-specialty-system/及Issue #5。个人学习明细在既有私密Notion，不在公开Git。

## 目录

| 路径 | 用途 |
| --- | --- |
| docs/OPERATING_RULES.md | 当前规则及每轮执行/回读要求 |
| docs/CONTINUITY.md | 分支、版本、部署边界、任务连续性与新窗口提示 |
| docs/FEEDBACK_LOG.md | 反馈状态、替代关系、测试及未解决项 |
| app/ | 当前脱敏网站前端、Worker与静态资源 |
| R8_8_*_CHANGELOG.md / TEST_MATRIX.md | 各版本实际改动、测试及局限 |
| PROJECT_STATE.md / ACTIVE_TASK.md | 最新状态与当前工单；较旧段落仅作历史 |
| HANDOFF.md / BACKLOG.md | 接续顺序与待处理缺口 |
| verification/test-r8-8-*.cjs | 已归档的指定回归脚本；按工单选用 |
| docs/SOURCE_MANIFEST.json / DATA_CONTRACT.json | 原r7附件来源清单与脱敏结构；不要求当前业务代码等于r7 |
| scripts/verify_project.py / package_deploy.py | 历史归档校验及打包工具，使用前核对其适用基线 |

静态预览不运行Cloudflare Worker/D1/R2，不能替代账号同步验收；合成测试不冒充实机。


## 2026-10-27双轨更新｜R8.8.28

从2026-10-28按数量稳分（5数推＋默认2强化＋6运算）、三科进阶（言语/判断/资料14—17）分别进度。一次同日发布，R28拆两卡，旧包兼容；研究分支banks/含两类题源索引/核验/政策。当前规则RULES-20261027-v3，详见docs/OPERATING_RULES.md、R8_8_28_CHANGELOG.md。尚未生产部署，需更新完整ZIP启用独立入口；不把候选当已核验题。
