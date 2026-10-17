; Protect Field's NSIS hooks, after AddaxAI's: the data folder is the user's, so the
; uninstaller asks before removing it and keeps it by default. The data folder
; (%USERPROFILE%\ProtectField) is never inside the install folder, so an update, which runs
; the old uninstaller first, cannot touch a card or a bundle.

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "Also remove your Protect Field data (the bundles and the cards you read, under $PROFILE\ProtectField)?$\r$\n$\r$\nChoose No to keep it for a later install." \
    IDYES removeData IDNO keepData
  removeData:
    RMDir /r "$PROFILE\ProtectField"
  keepData:
!macroend
