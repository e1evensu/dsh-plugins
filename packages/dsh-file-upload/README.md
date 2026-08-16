# @dsh-external/dsh-file-upload

任意文件上传 —— 把**不同目录、不同类型**的文件拖进 DSH 对话框，存到会话工作区的
`.dsh/references/`，并在草稿里插入 `[参考文件：名字](<相对路径>)`，模型按需用文件系统工具读取。

## 功能

- **📎 按钮**：输入框 dock 上的上传按钮，`multiple` 多选，单个文件上限 20MB。
- **页面级拖拽**：capture 阶段拦截 `dragenter/dragover/drop`——只要拖入的文件里有
  任何**非图片**（非 png/jpeg/webp/gif），整批走参考文件上传；
  **纯图片**拖拽完全不拦截，继续走 DSH 原生的图片附件轨道。
- **粘贴拦截**：剪贴板里粘贴非图片文件同样转参考上传。
- **同名去重**：落盘时文件名冲突自动追加 `-2`、`-3`…
- **排行榜联动**：每次上传成功向 leaderboard 自报一次计数。

## 为什么需要拦截

DSH 原生 composer 的拖拽只接收图片（attachment 管线只收 png/jpeg/webp/gif），
非图片会直接被拒并弹错误提示。本插件在 document 的 capture 阶段先下手：
非图片 drop 全部转走参考上传，图片 drop 原样放行，互不干扰。

## 数据落点

`<会话工作区>/.dsh/references/<文件名>`（与旧 reference-upload 同目录，兼容）。

## 构建与注入

```bash
DSH_CHECKOUT=/path/to/deepseek-harness bash scripts/build.sh   # host → lib/index.js
/path/to/deepseek-harness/node_modules/.bin/tsdown             # client → lib/client.js
# 注入器环境：dev_inject_plugin <本目录>；改代码后 dev_reload_package
```
