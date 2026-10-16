# 粉笔采集程序：统一候选版

目标是每天整理五套可作答完整卷，保留 A/B 卷身份与材料关系。此版本整合已有自动交卷修正、完整性核验、浏览器查询限时、进度提示及原始数据检查点。

**当前为候选版本。没有完成真实 Windows 账号的连续五卷验收，也没有证明稳定的每日五套产能。** 合成页面测试和历史 DOM 检查均不能替代真实页面及当前个人网站的导入验证。

## 当前改动

- 查询下一题/下一页使用可见 DOM 按钮，单步限时六秒；按钮有歧义时保留错误。
- 采集每轮输出已读取题数，阶段限时约九十秒，超时保留数据并标记待补。
- 进入采集流程前写入检查点；每轮更新，保存正常渲染的题目片段。
- 合格卷才生成 `paper_v2.json`；缺项、来源题数未知或资源未核验的卷不计入五套。
- 自动交卷为占位提交，单独记录，不作为个人学习成绩。自动无法识别确认窗时保留手动处理入口。

## Windows 应用构建

`.github/workflows/windows-build.yml` 在推送到 main 或手动触发时执行 Windows 构建：在 Windows 上运行合成页面测试，然后打包程序及 Chromium，并检查打包浏览器能否启动。

2026-10-16 已在 GitHub Windows runner 上完成构建：27 项测试、打包后帮助命令、上海时区数据及内置 Chromium 启动检查均通过。

[打开已成功构建的下载页面](https://github.com/mzyhs-Cyber/-/actions/runs/38842205857#artifacts)，登录 GitHub 后，在页面底部 Artifacts 下载 `FenbiCollector-Windows-candidate`（约 381 MB）。全部解压后双击 `FenbiCollector.exe`，无需另装 Python。须保留同一目录中的 `_internal` 文件夹。此工件保留 14 天；过期后可重新运行构建。构建记录见 `WINDOWS_BUILD_CHECK.json`。

应用仍需使用电脑网络，在其打开的浏览器中正常登录粉笔；账号登录不会由聊天会话自动提供。真实网页、图片与导入行为仍需验收。

## 开发运行

使用 Python 3.10 或更新版本：

```sh
python -m pip install -r requirements.txt
python -m playwright install chromium
python standalone_main.py
```

原有 CLI 参数可用：`--plan` 明确当天目标，`--daily-target 5` 指定数量，`--no-auto-submit` 关闭自动交卷。计划条目为正常页面的 `url`、完整 `title`、经核实的 `expected_count`，不得猜接口或统一套用题量。

## 输出与诊断

输出在 `fenbi_output/`：启动状态、`capture_checkpoint.json`、逐卷工作数据、V2、audit/missing/media 报告和每日结果。检查点属于中间数据，不能直接算作完整卷。正常渲染题目资源与平台统计保留来源，不推理补出官方答案。

`fenbi_browser_profile/` 是本机登录目录，不得上传或共享。题库、学习记录、账号资料和真实页面抓取文件均不应提交到本仓库；测试只有原创合成内容。

## 验证

```sh
python -m unittest discover -s tests -v
python standalone_main.py --smoke-test
```

测试覆盖材料关系、图片选项、残缺卷拒绝、自动确认及歧义处理、跨页五卷、查询超时及检查点保存。真实粉笔登录、来源访问许可、Windows 桌面显示与个人网站导入仍是单独的验收项。

2026-10-16 本地 Linux 验证：27 项测试通过，浏览器启动检查通过。历史 DOM 复跑读取 130 题，130 个答案与既有结果一致，保留五组材料及 25 道关联题，并成功保存检查点。该历史检查使用已核实的题序、科目和总题数作为包装信息，不能证明当前网站的题序、科目或总题数识别成功。汇总见 `TEST_RESULTS.txt` 和 `HISTORICAL_DOM_CHECK.json`；历史题目内容不随程序提交。
