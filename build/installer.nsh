!macro customInstall
  WriteRegStr HKCU "Software\Classes\.jpg\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.jpg\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.jpg\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.jpeg\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.jpeg\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.jpeg\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.png\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.png\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.png\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.webp\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.webp\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.webp\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.gif\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.gif\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.gif\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.bmp\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.bmp\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.bmp\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.ico\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.ico\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.ico\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.svg\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.svg\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.svg\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\.avif\shell\ImageViewer" "" "이미지 뷰어로 보기"
  WriteRegStr HKCU "Software\Classes\.avif\shell\ImageViewer" "Icon" "$INSTDIR\이미지 뷰어.exe,0"
  WriteRegStr HKCU "Software\Classes\.avif\shell\ImageViewer\command" "" '"$INSTDIR\이미지 뷰어.exe" "%1"'
!macroend

!macro customUninstall
  DeleteRegKey HKCU "Software\Classes\.jpg\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.jpeg\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.png\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.webp\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.gif\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.bmp\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.ico\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.svg\shell\ImageViewer"
  DeleteRegKey HKCU "Software\Classes\.avif\shell\ImageViewer"
!macroend
