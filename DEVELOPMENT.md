# chat 源码与检查

本仓库维护应用源码及应用私有测试。Chrona 主仓只提供通用 kernel、宿主、CLI、SDK 与合同；不再保存应用源码、应用共享业务包或固定应用副本。应用间组合测试放在拥有者的 `integration/`，使用同级 `chrona-module-*` checkout；通用 kernel/宿主测试依赖使用同级 `Chrona/` checkout。这些路径用于开发组合，不是自动安装或运行应用的入口。

本轮仅迁移/编辑源码并做文件、导入、JSON 与 diff 静态检查；没有构建、编译、测试、lint、typecheck、安装、模型/服务调用、提交或推送。`vendor/`、既有运行/浏览器制品、`bun.lock`、`chrona-material.json`、材料 hash/pin 未因本轮源码修改而重算，旧制品不能证明这些修改已生效。后续发行须在授权构建后生成真实制品、锁与材料记录。
