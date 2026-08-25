Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\jakew\Desktop\Claude Code Design\Pokemon App\scripts\prod-health-check.ps1""", 0, True
