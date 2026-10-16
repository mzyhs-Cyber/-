# 接手后的验证方法

## 开发环境与复跑

当前 Linux 云环境：仓库 `/workspace/-`，已存在 `/workspace/crawler_venv/bin/python`，系统 Chromium `/usr/bin/chromium`。不要假设换一个任务或机器后这些绝对路径仍在。

当前环境复跑：

```sh
cd /workspace/-
TEST_CHROMIUM_EXECUTABLE=/usr/bin/chromium /workspace/crawler_venv/bin/python -m unittest discover -s tests -v
TEST_CHROMIUM_EXECUTABLE=/usr/bin/chromium /workspace/crawler_venv/bin/python standalone_main.py --smoke-test
```

新环境按 `requirements.txt` 安装。建议使用和 Windows CI 一致的 Python 3.12，安装 Playwright Chromium；浏览器系统依赖按运行环境支持的方法安装，不关闭 TLS、校验或测试来假装成功。

```sh
python -m venv .venv
# 激活对应平台的 .venv 后
python -m pip install -r requirements.txt
python -m playwright install chromium
python -m unittest discover -s tests -v
python standalone_main.py --smoke-test
```

## Windows 构建

`.github/workflows/windows-build.yml`：Python 3.12，安装依赖、Chromium、PyInstaller；跑测试；打包 Playwright、tzdata、两个 JS；执行 EXE 的 `--help` 和 `--smoke-test`；上传工件。

用户端全部解压，保留 `_internal`。运行 `FenbiCollector.exe`，2.3 首行应有 `2.3-candidate`。程序文件旁保存输出与本机登录目录。不要让用户往已显示“Press any key”的已结束窗口粘贴 PowerShell，也不要再分发大段 Base64。

读取具体构建状态，不能只看“已推送”。本环境 Git HTTPS 读写成功；`gh api` 到 `api.github.com` 曾被代理拒绝，`gh auth status` 显示 token 无效不证明 Git 注入认证失效。不要索取用户 PAT 或提取代理凭据。公开 GitHub Actions HTML 可读取构建状态与 check-step 结论；详细日志匿名访问受限，当前 workflow 会将失败尾部放在公开检查注释，约束在 3000 字符内。

## 真实采集验收（仍未通过）

1. 在实际有权限且联网的环境，正常登录粉笔；不要复制登录目录到云端。
2. 先验证一份具体 A 卷和一份 B 卷。记录完整标题、正常页面 URL、原页面/答题卡总数、题序、来源版本；不要预填 130/135。
3. 分别验证“已有解析”和“需正常交卷才有解析”。占位提交会改变平台练习历史，但不作为真实个人学习成绩。
4. 检查等待、下一题、滚动、标题/题序/材料关联及原始 ID。缺字段存待补，校验失败不能计数。
5. 检查逐卷输出：`questions.json`, `rendered_dom.json`, `source_provenance.json`, `audit.json`, `missing.json`, `media_manifest.json`, `receipt.json`；合格才有 `paper_v2.json`，否则可能为 `paper_v2_pending.json`。
6. 查看 `capture_checkpoint.json`, `run_status.json`, `crawler.log`。列表失败还有 `listing_failure.json/png`；启动失败可能有 `last_error.json`。这些本地文件不会自动上传。
7. 批量采集五份完整卷，确认 A/B 身份、别名去重、数量和所有 receipt 的真实文件哈希；查看当天 `daily_日期.json` 的 `target_met`、题位和唯一题数。
8. 在个人网站独立测试存储中逐卷导入、导出复核。不能直接操作/清空用户已有个人题库或练习记录来省事。

## 历史资料离线验证

完整资料包中 `03_已有关键成果/` 可直接找到旧的 2026 两卷 V2 和导入证据；`04_原始附件/` 的四卷 ZIP 保留全部旧资料。旧转换器 `convert_current_v2.py` 支持已见的 solutions、questions 和 V2；按旧说明提取 card 的顺序，不按数组顺序跨卷拼接。

`tools/check_historical_dom.py`（仅本地完整包）需要将旧的 `/workspace/handoff_read/...` 路径替换为实际解压目录。它拦截所有外网请求，并用已有 V2 包装题序/科目/题数，因此不能用于证明页面元数据识别或在线图片可用。

## 修复新问题的优先级

先复现 A 的异步/可见状态，再找 B 的独立题量证据，再修无新增内容的停止边界；详细假设见 `02_CURRENT_ISSUES.md`。给新增失败场景加回归，跑相关测试；全部检查通过后才构建交付。不要为了“通过”删除完整性校验、把已抓题数当总数，或伪造成功日志。

所需真实 DOM/日志如果不在执行环境，就明确说没有读取；优先使用有本机访问能力的工作环境，而不是让用户再次手工调代码。
