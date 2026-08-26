' Launches the daily auto-rerun with no console window.
'
' Task Scheduler runs node.exe directly by default, and node is a console app, so Windows
' gives it a visible window for the whole run — ~15 minutes of a CMD box sitting on the
' desktop. WScript.Shell.Run with intWindowStyle 0 starts it hidden instead.
'
' Registered as:  wscript.exe "<this file>"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\sabih.siddiqui\Desktop\Automation\K12CateringAutomation"
sh.Run """C:\Program Files\nodejs\node.exe"" scripts\auto-rerun-latest.js", 0, False
