# R8.8.73-gray1｜排除选项变灰

知遥集 R73｜排除选项变灰合并版（gray1）

本包已包含变灰效果，可按原方式整体部署，不需要另加补丁。

排除后：文字、选项字母和底色一起变灰，图片选项淡化；取消排除恢复原样。
夜间模式和笔记模式适配；复盘中正确、错误选项的结果颜色保留。

原因为 reading-typography.css 后加载覆盖了旧排除文字颜色，reading.css 也将按钮背景强制透明。
本次新增 excluded-options.css，放在已有样式之后；index.html 只新增样式引用，sw.js 只更新缓存名称与新增资源列表。

与上传的 R73 比较：全部作答、笔迹、计时、增量保存和同步脚本，以及 _worker.js、_headers、_routes.json、生日页，均保持原字节。

部署：解压本完整包，将含 index.html 和 _worker.js 的全部文件上传到原 Cloudflare Pages 项目 jiangsu-study-mzy-sync。
本次 GitHub 保存不代表主站已部署。

原 R73 交付报告中的测试不是本次新执行；本次合包验证见 ../verification/r73-gray1/merge.json。
