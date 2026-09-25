; electron-builder NSIS include (picked up automatically from build/installer.nsh).
; Uninstall removes the launch at login entry the app wrote (Settings > Launch at login), so Windows does not keep a
; startup item that points at a deleted exe. An update runs the old uninstaller with --updated: the entry stays, and the
; new version keeps the user's choice (including a Task Manager disable in StartupApproved).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.joao.worldclock"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "io.joao.worldclock"
  ${endIf}
!macroend
