Set WshShell = CreateObject("WScript.Shell")
Dim dir
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = dir
If Not CreateObject("Scripting.FileSystemObject").FolderExists(dir & "\node_modules") Then
    WshShell.Run "cmd /c npm install", 1, True
End If
Dim cmd
cmd = "cmd /c cd /d """ & dir & """ & node server.js"
WshShell.Run cmd, 0, False
