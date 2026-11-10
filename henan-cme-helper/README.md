# 医学类继续教育学习平台助手

当前版本：5.5.56.1066。

## 安装及更新

- [GitHub 原始脚本](https://raw.githubusercontent.com/Axetk/UnipusGetAnswer/master/henan-cme-helper/acceptance-helper.user.js)
- [现有 HTTPS 安装及更新入口](https://api.axetk.icu/payment-test/portal/acceptance-helper.user.js)

在脚本猫中从上述脚本网址安装，之后可使用脚本猫的检查更新。脚本已显式配置 @updateURL 和 @downloadURL，目前两者都指向现有 HTTPS 入口；GitHub 是同版本托管镜像。修改 GitHub 文件不会自动部署到业务服务器，发布时需核对两处版本及 SHA256 一致。

当前脚本名称为“医学类继续教育学习平台(已支持华医网,河南省继续医学教育学习平台)[AI答题][一键启动][最小化运行]”，namespace 保持不变。更新时只启用一份，停用旧名称或重复安装的脚本。自动更新是否执行取决于脚本猫设置和网络；本次尚未实机验证自动更新过程。

## 本次变更

版本由 5.5.56.1065 更新为 5.5.56.1066，补充华医网学习提醒弹窗的真实容器 `.study_diaog` 和 `.sign-in-menu`，沿用原有安全判断自动关闭提醒并恢复播放；包含验证输入框的容器不会被误关。元数据版本、华医适配器内嵌版本和运行时版本保持一致；定向回归 3 项、全量回归 267 项全部通过。

本目录只托管公开脚本和说明，不包含后端、数据库、密钥、Token、订单或备份。仓库根目录原有项目不变。

脚本头部“不占网速、不费流量、不会中断”是用户指定的说明文案，并非实测保证；视频播放、查询和更新会使用网络，浏览器或系统休眠也可能中断运行。

GitHub 与 HTTPS 安装入口当前脚本 SHA256：`727415d060b8af07b06f959e6ffba78699c4c99ff4e5e7e66d752d44cdd92fb4`。
