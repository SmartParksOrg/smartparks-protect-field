; Protect Go's NSIS hooks, after AddaxAI's: the data folder is the user's. An update runs the
; old uninstaller first and never asks about it (Tim, 2026-10-17: a question with "Yes" as the
; way to lose everything had no place in an update; decision D24); a silent uninstall removes
; nothing; a real uninstall asks whether to keep the data, and keeping it is the default and
; the "Yes". The data folder (%USERPROFILE%\ProtectGo) is never inside the install folder, so
; no uninstall can touch a card or a bundle by accident.

!macro customUnInstall
  ${if} ${isUpdated}
    Goto dataKept
  ${endif}
  ${if} ${Silent}
    Goto dataKept
  ${endif}
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 \
    "Keep your Protect Go data?$\r$\n$\r$\nThe bundles and the files you read are under $PROFILE\ProtectGo.$\r$\n$\r$\nYes keeps them for a later install. No removes them for good." \
    IDYES dataKept IDNO dataRemoved
  dataRemoved:
    RMDir /r "$PROFILE\ProtectGo"
  dataKept:
!macroend

; An update keeps a window on the screen (Tim, 2026-10-17; decision D22): the app starts the
; installer visibly, which skips its license and directory pages when run as an update
; (electron-builder's own rule) and shows the install page with its progress bar. Once the
; files are in, the page closes by itself, the finish page is skipped, and the app starts
; again, so nobody clicks and nothing goes dark between the steps. A first install keeps the
; finish page with its "Run Protect Go" box.

!macro customInstall
  ${if} ${isUpdated}
    SetAutoClose true
  ${endif}
!macroend

!macro customFinishPage
  ; electron-builder's own StartApp macro declares a variable each time it is inserted, so
  ; it cannot be used twice; this function does the same with the installer's launch link
  Function startProtectGo
    ${if} ${isUpdated}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
    ${else}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
    ${endif}
  FunctionEnd

  Function skipFinishPageIfUpdated
    ${if} ${isUpdated}
      Call startProtectGo
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE skipFinishPageIfUpdated
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "startProtectGo"
  !insertmacro MUI_PAGE_FINISH
!macroend
