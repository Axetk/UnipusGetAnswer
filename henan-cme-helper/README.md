# 医学类继续教育学习平台助手

当前版本：5.5.56.1063。

## 安装及更新

- [GitHub 原始脚本](https://raw.githubusercontent.com/Axetk/UnipusGetAnswer/master/henan-cme-helper/acceptance-helper.user.js)
- [现有 HTTPS 安装及更新入口](https://api.axetk.icu/payment-test/portal/acceptance-helper.user.js)

在脚本猫中从上述脚本网址安装，之后可使用脚本猫的检查更新。脚本已显式配置 @updateURL 和 @downloadURL，目前两者都指向现有 HTTPS 入口；GitHub 是同版本托管镜像。修改 GitHub 文件不会自动部署到业务服务器，发布时需核对两处版本及 SHA256 一致。

当前脚本名称为“医学类继续教育学习平台[AI答题][一键启动][最小化运行]”，namespace 保持不变。更新时只启用一份，停用旧名称或重复安装的脚本。自动更新是否执行取决于脚本猫设置和网络；本次尚未实机验证自动更新过程。

## 本次变更

更新到 5.5.56.1063，新增华医网课程、播放和考试流程，接入刷脸页定时刷新、播放页模拟鼠标活动及互动弹窗源头抑制；保留河南继续医学教育原有流程、题库 Token 和扣费规则。名称、说明和标签已同步为当前正式值，全量回归 267 项通过。

本目录只托管公开脚本和说明，不包含后端、数据库、密钥、Token、订单或备份。仓库根目录原有项目不变。

脚本头部“不占网速、不费流量、不会中断”是用户指定的说明文案，并非实测保证；视频播放、查询和更新会使用网络，浏览器或系统休眠也可能中断运行。

GitHub 与 HTTPS 安装入口当前脚本 SHA256：`506a02e4b77a8fc4dce74733a56768bb8741e53e46394b0bb9100eafcedb69da`。
