# 知遥集 · 开发与训练接续入口

## 2026-10-29｜恢复 R8.8.51 并继续复盘改进

用户重新上传R51完整部署包，并要求同步GitHub。基线ZIP SHA256：c05285b758b30a8f9a04af585e3596ee461711d5a65f9e46cce1f338a5354eea；62项、CRC通过。公开Git仅保存59个部署资产（60项排除私人birthday.html）与两份原交付报告，保留仓库其他文件与旧提交。原报告中的“未提交Git”是当时状态，恢复提交不冒充重新执行历史21组/500题测试。

当前工单已授权实现三项：①从需复盘入口进入，底部答题卡只显示同一批题并保留原题号；②复现顶部导航偶发跳首题并修复，未复现前不臆定根因；③复盘可擦除/修改原笔迹，并永久保存修改。第三项取代旧的“退出后恢复原笔迹/临时编辑不持久化”要求，原答案/得分/耗时与交卷证据保持独立。当前仍未实现这三项，未部署或实机验收。

R51性能与保护范围见app/RELEASE_NOTES.md及app/AUDIT_REPORT.md。历史R29—R51完整测试夹具已随工作区维护丢失；当前恢复包只有部署代码与原交付报告，不能宣称找回全部开发中间文件。已恢复源码可继续开发并补建相关验证。


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
