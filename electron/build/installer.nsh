; Protect Go's NSIS hooks, after AddaxAI's: the data folder is the user's, so the
; uninstaller asks before removing it and keeps it by default. The data folder
; (%USERPROFILE%\ProtectGo) is never inside the install folder, so an update, which runs
; the old uninstaller first, cannot touch a card or a bundle.

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "Also remove your Protect Go data (the bundles and the cards you read, under $PROFILE\ProtectGo)?$\r$\n$\r$\nChoose No to keep it for a later install." \
    IDYES removeData IDNO keepData
  removeData:
    RMDir /r "$PROFILE\ProtectGo"
  keepData:
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
