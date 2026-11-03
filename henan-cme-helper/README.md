# 河南省继续医学教育学习平台助手

当前版本：5.5.56.1017。

## 安装及更新

- [GitHub 原始脚本](https://raw.githubusercontent.com/Axetk/UnipusGetAnswer/master/henan-cme-helper/acceptance-helper.user.js)
- [现有 HTTPS 安装及更新入口](https://api.axetk.icu/payment-test/portal/acceptance-helper.user.js)

在脚本猫中从上述脚本网址安装，之后可使用脚本猫的检查更新。脚本已显式配置 @updateURL 和 @downloadURL，目前两者都指向现有 HTTPS 入口；GitHub 是同版本托管镜像。修改 GitHub 文件不会自动部署到业务服务器，发布时需核对两处版本及 SHA256 一致。

名称和 namespace 保持稳定，更新时只启用一份，停用旧名称或重复安装的脚本。自动更新是否执行取决于脚本猫设置和网络；本次尚未实机验证自动更新过程。

## 本次变更

统一头部及内部诊断版本到 5.5.56.1017，增加明确的检查更新与下载地址。扣费、去重、审核、业务接口和页面流程不变。

本目录只托管公开脚本和说明，不包含后端、数据库、密钥、Token、订单或备份。仓库根目录原有项目不变。

脚本头部“不占网速、不费流量、不会中断”是既有说明文案，并非实测保证；视频播放、查询和更新会使用网络，浏览器或系统休眠也可能中断运行。

本次公网脚本 SHA256：`0e798b686a4541c8fdf015aa5e961ac0f9f435b9a7f4dcf857837e530daaaed0`。
