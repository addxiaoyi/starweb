# Stopping the development stack

This project starts frontend and backend in separate processes.

## Linux

If you started the stack with:

```bash
bash scripts/start-all.sh
```

Press `Ctrl+C` in the terminal where it is running.
The script will try to terminate both child processes.

## Windows PowerShell

If you started the stack with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-all.ps1
```

Press `Ctrl+C` in the same PowerShell window.

## Notes

- `.runtime/` 仍会被创建，但当前 `start-all.*` 不再依赖其中的端口记录来恢复运行状态。
- 如果进程在异常退出后残留，请直接按实际监听端口或进程名清理；当前端口来源以 `npm run config:doctor` 生成的配置为准。
