Attribute VB_Name = "StickyNotes"
'==============================================================================
' StickyNotes - post-its de revision para PowerPoint (estilo consultoria)
'
' Botones (pestana Inicio > grupo "Stickies"):
'   Nuevo sticky       -> AddSticky
'   Siguiente          -> NextSticky
'   Ocultar / mostrar  -> ToggleStickies
'   Borrar todos       -> DeleteAllStickies
'
' Cada sticky se marca con el tag BB_STICKY=1 y un nombre "Sticky_...",
' asi se pueden encontrar y borrar todos de una vez antes de enviar.
'==============================================================================
Option Explicit

Private Const STICKY_TAG As String = "BB_STICKY"
Private Const STICKY_PREFIX As String = "Sticky_"
Private Const STICKY_W As Single = 190
Private Const STICKY_H As Single = 60
Private Const STICKY_MARGIN As Single = 15
Private Const STICKY_STEP As Single = 12

' Constantes de Office definidas aqui para no depender de la referencia
' "Microsoft Office xx.0 Object Library"
Private Const K_TRUE As Long = -1          ' msoTrue
Private Const K_FALSE As Long = 0          ' msoFalse
Private Const K_RECT As Long = 1           ' msoShapeRectangle
Private Const K_AUTOSIZE_SHAPE As Long = 1 ' msoAutoSizeShapeToFitText
Private Const K_ANCHOR_TOP As Long = 1     ' msoAnchorTop
Private Const K_ALIGN_LEFT As Long = 1     ' msoAlignLeft

'------------------------------------------------------------------------------
' Callbacks del ribbon (firma: control As IRibbonControl, declarado como Object
' para no depender de la referencia a la libreria de Office)
'------------------------------------------------------------------------------
Public Sub Rb_AddSticky(control As Object)
    AddSticky
End Sub

Public Sub Rb_NextSticky(control As Object)
    NextSticky
End Sub

Public Sub Rb_ToggleStickies(control As Object)
    ToggleStickies
End Sub

Public Sub Rb_DeleteAllStickies(control As Object)
    DeleteAllStickies
End Sub

'------------------------------------------------------------------------------
' Nuevo sticky en la lamina actual, con el cursor listo para escribir
'------------------------------------------------------------------------------
Public Sub AddSticky()
    Dim sld As Slide, shp As Shape
    Dim header As String, n As Long
    Dim x As Single, y As Single

    Set sld = GetCurrentSlide()
    If sld Is Nothing Then
        MsgBox "Abre una presentacion y selecciona una lamina.", vbExclamation, "Stickies"
        Exit Sub
    End If

    ' Si ya hay stickies en la lamina, el nuevo se desplaza en cascada
    n = CountStickiesOnSlide(sld)
    x = ActivePresentation.PageSetup.SlideWidth - STICKY_W - STICKY_MARGIN - (n Mod 6) * STICKY_STEP
    y = STICKY_MARGIN + (n Mod 6) * STICKY_STEP

    Set shp = sld.Shapes.AddShape(K_RECT, x, y, STICKY_W, STICKY_H)

    ' Encabezado en negrita; el espacio final va sin negrita para que
    ' lo que escribas despues quede en texto normal
    header = "[" & GetInitials() & " " & Format(Now, "dd-mmm hh:nn") & "] "

    With shp
        .Name = STICKY_PREFIX & Format(Now, "yymmddhhnnss") & "_" & CStr(n + 1)
        .Tags.Add STICKY_TAG, "1"
        .Fill.Visible = K_TRUE
        .Fill.Solid
        .Fill.ForeColor.RGB = RGB(255, 242, 117)
        .Fill.Transparency = 0
        .Line.Visible = K_FALSE
        With .Shadow
            .Visible = K_TRUE
            .ForeColor.RGB = RGB(0, 0, 0)
            .OffsetX = 2
            .OffsetY = 2
            .Transparency = 0.65
            .Blur = 4
        End With
        With .TextFrame2
            .WordWrap = K_TRUE
            .VerticalAnchor = K_ANCHOR_TOP
            .MarginLeft = 6
            .MarginRight = 6
            .MarginTop = 4
            .MarginBottom = 4
            With .TextRange
                .Text = header
                .ParagraphFormat.Alignment = K_ALIGN_LEFT
                .Font.Size = 11
                .Font.Fill.ForeColor.RGB = RGB(0, 0, 0)
                .Font.Bold = K_FALSE
            End With
            .TextRange.Characters(1, Len(header) - 1).Font.Bold = K_TRUE
            .AutoSize = K_AUTOSIZE_SHAPE
        End With
    End With

    ' Dejar el cursor al final del encabezado para escribir directo
    On Error Resume Next
    If ActiveWindow.Panes.Count >= 2 Then ActiveWindow.Panes(2).Activate
    shp.Select
    shp.TextFrame.TextRange.Characters(Len(header) + 1, 0).Select
    On Error GoTo 0
End Sub

'------------------------------------------------------------------------------
' Salta al siguiente sticky del deck (recorre en orden y vuelve al inicio)
'------------------------------------------------------------------------------
Public Sub NextSticky()
    Dim cur As Long, total As Long, i As Long, k As Long, idx As Long
    Dim sld As Slide, shp As Shape, curShapeName As String
    Dim passedCurrent As Boolean

    If Application.Presentations.Count = 0 Then Exit Sub
    total = ActivePresentation.Slides.Count
    If total = 0 Then Exit Sub

    Set sld = GetCurrentSlide()
    If sld Is Nothing Then cur = 1 Else cur = sld.SlideIndex

    ' Si hay un sticky seleccionado, buscar el siguiente en la misma lamina
    On Error Resume Next
    curShapeName = ""
    If ActiveWindow.Selection.Type = ppSelectionShapes Or ActiveWindow.Selection.Type = ppSelectionText Then
        If IsSticky(ActiveWindow.Selection.ShapeRange(1)) Then
            curShapeName = ActiveWindow.Selection.ShapeRange(1).Name
        End If
    End If
    On Error GoTo 0

    For k = 0 To total
        idx = ((cur - 1 + k) Mod total) + 1
        passedCurrent = (k > 0) Or (curShapeName = "")
        For i = 1 To ActivePresentation.Slides(idx).Shapes.Count
            Set shp = ActivePresentation.Slides(idx).Shapes(i)
            If IsSticky(shp) Then
                If passedCurrent Then
                    GoToShape idx, shp
                    Exit Sub
                ElseIf shp.Name = curShapeName Then
                    passedCurrent = True
                End If
            End If
        Next i
    Next k

    MsgBox "No hay stickies en esta presentacion.", vbInformation, "Stickies"
End Sub

'------------------------------------------------------------------------------
' Oculta todos los stickies si alguno esta visible; si todos estan ocultos, los muestra
'------------------------------------------------------------------------------
Public Sub ToggleStickies()
    Dim sld As Slide, shp As Shape
    Dim anyVisible As Boolean, found As Long

    If Application.Presentations.Count = 0 Then Exit Sub

    For Each sld In ActivePresentation.Slides
        For Each shp In sld.Shapes
            If IsSticky(shp) Then
                found = found + 1
                If shp.Visible = K_TRUE Then anyVisible = True
            End If
        Next shp
    Next sld

    If found = 0 Then
        MsgBox "No hay stickies en esta presentacion.", vbInformation, "Stickies"
        Exit Sub
    End If

    For Each sld In ActivePresentation.Slides
        For Each shp In sld.Shapes
            If IsSticky(shp) Then
                If anyVisible Then shp.Visible = K_FALSE Else shp.Visible = K_TRUE
            End If
        Next shp
    Next sld
End Sub

'------------------------------------------------------------------------------
' Borra todos los stickies del deck (con confirmacion)
'------------------------------------------------------------------------------
Public Sub DeleteAllStickies()
    Dim sld As Slide, i As Long
    Dim nStickies As Long, nSlides As Long, onSlide As Long

    If Application.Presentations.Count = 0 Then Exit Sub

    For Each sld In ActivePresentation.Slides
        onSlide = CountStickiesOnSlide(sld)
        nStickies = nStickies + onSlide
        If onSlide > 0 Then nSlides = nSlides + 1
    Next sld

    If nStickies = 0 Then
        MsgBox "No hay stickies en esta presentacion. Lista para enviar.", vbInformation, "Stickies"
        Exit Sub
    End If

    If MsgBox("Se borraran " & nStickies & " sticky(s) en " & nSlides & " lamina(s)." & vbCrLf & _
              "Esto no se puede deshacer en bloque. Continuar?", _
              vbQuestion + vbYesNo + vbDefaultButton2, "Stickies") <> vbYes Then Exit Sub

    For Each sld In ActivePresentation.Slides
        For i = sld.Shapes.Count To 1 Step -1
            If IsSticky(sld.Shapes(i)) Then sld.Shapes(i).Delete
        Next i
    Next sld

    MsgBox nStickies & " sticky(s) borrados. Lista para enviar.", vbInformation, "Stickies"
End Sub

'==============================================================================
' Auxiliares
'==============================================================================
Private Function IsSticky(shp As Shape) As Boolean
    Dim t As String
    On Error Resume Next
    t = shp.Tags(STICKY_TAG)
    On Error GoTo 0
    IsSticky = (t = "1") Or (Left$(shp.Name, Len(STICKY_PREFIX)) = STICKY_PREFIX)
End Function

Private Function CountStickiesOnSlide(sld As Slide) As Long
    Dim shp As Shape, n As Long
    For Each shp In sld.Shapes
        If IsSticky(shp) Then n = n + 1
    Next shp
    CountStickiesOnSlide = n
End Function

Private Function GetCurrentSlide() As Slide
    On Error GoTo Fail
    If Application.Presentations.Count = 0 Then GoTo Fail
    If Application.Windows.Count = 0 Then GoTo Fail
    If ActiveWindow.ViewType <> ppViewNormal And ActiveWindow.ViewType <> ppViewSlide Then
        ActiveWindow.ViewType = ppViewNormal
    End If
    Set GetCurrentSlide = ActiveWindow.View.Slide
    Exit Function
Fail:
    Set GetCurrentSlide = Nothing
End Function

Private Sub GoToShape(slideIdx As Long, shp As Shape)
    On Error Resume Next
    If ActiveWindow.ViewType <> ppViewNormal And ActiveWindow.ViewType <> ppViewSlide Then
        ActiveWindow.ViewType = ppViewNormal
    End If
    ActiveWindow.View.GotoSlide slideIdx
    If ActiveWindow.Panes.Count >= 2 Then ActiveWindow.Panes(2).Activate
    If shp.Visible = K_FALSE Then shp.Visible = K_TRUE
    shp.Select
End Sub

' Iniciales de Office (Archivo > Opciones > General); si no hay, usuario de Windows
Private Function GetInitials() As String
    Dim s As String, wsh As Object
    On Error Resume Next
    Set wsh = CreateObject("WScript.Shell")
    s = wsh.RegRead("HKCU\Software\Microsoft\Office\Common\UserInfo\UserInitials")
    If Len(Trim$(s)) = 0 Then s = wsh.RegRead("HKCU\Software\Microsoft\Office\Common\UserInfo\UserName")
    On Error GoTo 0
    If Len(Trim$(s)) = 0 Then s = Environ$("USERNAME")
    GetInitials = Trim$(s)
End Function
