*&---------------------------------------------------------------------*
*& Report ZSMARTFORMS  (transaction ZSMARTFORMS, SE93: program ZSMARTFORMS, screen 1000)
*&---------------------------------------------------------------------*
*& Opens the ZSMARTFORMS web editor (ICF service /sap/bc/zsmartforms) in
*& the browser, logged on in the current client and language.
*& The editor reads forms / styles from this system and saves them back
*& without the SMARTFORMS upload dialog.
*&
*& The browser is started directly (its .exe), not through the Windows
*& URL association: on PCs where no app is registered for http/https
*& ShellExecute and Explorer only answer "Application not found".
*& Order: default browser from the registry -> Edge -> Chrome -> Firefox
*& -> URL association -> URL to clipboard.
*&---------------------------------------------------------------------*
REPORT zsmartforms.

CONSTANTS c_path TYPE string VALUE '/sap/bc/zsmartforms'.

CLASS lcl_launcher DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_url      TYPE string
                iv_protocol TYPE string.
    METHODS open
      RETURNING VALUE(rv_how) TYPE string.

  PRIVATE SECTION.
    DATA mv_url      TYPE string.
    DATA mv_protocol TYPE string.

    METHODS default_browser_command
      RETURNING VALUE(rv_command) TYPE string.
    METHODS registry_value
      IMPORTING iv_root         TYPE i
                iv_key          TYPE string
                iv_value        TYPE string
      RETURNING VALUE(rv_value) TYPE string.
    METHODS run
      IMPORTING iv_application TYPE string
                iv_parameter   TYPE string
      RETURNING VALUE(rv_ok)   TYPE abap_bool.
    METHODS run_command
      IMPORTING iv_command   TYPE string
      RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDCLASS.


CLASS lcl_launcher IMPLEMENTATION.

  METHOD constructor.
    mv_url      = iv_url.
    mv_protocol = to_lower( iv_protocol ).
  ENDMETHOD.


  METHOD open.
    " 1) the user's default browser, read from the registry
    DATA(lv_command) = default_browser_command( ).
    IF lv_command IS NOT INITIAL AND run_command( lv_command ) = abap_true.
      rv_how = `default browser`.
      RETURN.
    ENDIF.

    " 2) well-known browsers; ShellExecute finds them through App Paths
    "    (HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths)
    DATA lt_exes TYPE STANDARD TABLE OF string WITH EMPTY KEY.
    lt_exes = VALUE #( ( `msedge.exe` ) ( `chrome.exe` ) ( `firefox.exe` ) ).
    LOOP AT lt_exes INTO DATA(lv_exe).
      IF run( iv_application = lv_exe iv_parameter = |"{ mv_url }"| ) = abap_true.
        rv_how = lv_exe.
        RETURN.
      ENDIF.
    ENDLOOP.

    " 3) URL association (non-Windows SAP GUI)
    cl_gui_frontend_services=>execute(
      EXPORTING
        document = mv_url
      EXCEPTIONS
        OTHERS   = 1 ).
    IF sy-subrc = 0.
      rv_how = `URL association`.
    ENDIF.
  ENDMETHOD.


  METHOD default_browser_command.
    " HKCU\...\UrlAssociations\http(s)\UserChoice  ProgId  -> e.g. ChromeHTML, MSEdgeHTM, FirefoxURL-…
    DATA(lv_progid) = registry_value(
      iv_root  = cl_gui_frontend_services=>hkey_current_user
      iv_key   = |Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\{ mv_protocol }\\UserChoice|
      iv_value = `ProgId` ).
    IF lv_progid IS INITIAL AND mv_protocol <> `http`.
      lv_progid = registry_value(
        iv_root  = cl_gui_frontend_services=>hkey_current_user
        iv_key   = `Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice`
        iv_value = `ProgId` ).
    ENDIF.
    IF lv_progid IS INITIAL.
      RETURN.
    ENDIF.
    " HKCR\<ProgId>\shell\open\command  (default value)
    rv_command = registry_value(
      iv_root  = cl_gui_frontend_services=>hkey_classes_root
      iv_key   = |{ lv_progid }\\shell\\open\\command|
      iv_value = `` ).
  ENDMETHOD.


  METHOD registry_value.
    DATA lv_value TYPE string.
    cl_gui_frontend_services=>registry_get_value(
      EXPORTING
        root                = iv_root
        key                 = iv_key
        value               = iv_value
      IMPORTING
        reg_value           = lv_value
      EXCEPTIONS
        get_regvalue_failed = 1
        cntl_error          = 2
        error_no_gui        = 3
        not_supported_by_gui = 4
        OTHERS              = 5 ).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    cl_gui_cfw=>flush( EXCEPTIONS OTHERS = 1 ).
    IF sy-subrc = 0.
      rv_value = condense( lv_value ).
    ENDIF.
  ENDMETHOD.


  METHOD run_command.
    " "C:\Program Files\Google\Chrome\Application\chrome.exe" --single-argument %1
    " C:\Program Files\Mozilla Firefox\firefox.exe -osint -url "%1"
    DATA lv_exe  TYPE string.
    DATA lv_args TYPE string.

    IF iv_command IS INITIAL.
      RETURN.
    ENDIF.
    IF substring( val = iv_command len = 1 ) = `"`.
      DATA(lv_rest) = substring( val = iv_command off = 1 ).
      SPLIT lv_rest AT `"` INTO lv_exe lv_args.
    ELSE.
      FIND FIRST OCCURRENCE OF REGEX `\.exe` IN iv_command IGNORING CASE MATCH OFFSET DATA(lv_off) MATCH LENGTH DATA(lv_len).
      IF sy-subrc <> 0.
        RETURN.
      ENDIF.
      lv_exe  = substring( val = iv_command len = lv_off + lv_len ).
      lv_args = substring( val = iv_command off = lv_off + lv_len ).
    ENDIF.
    lv_args = condense( lv_args ).

    IF lv_args CS `"%1"`.
      REPLACE ALL OCCURRENCES OF `%1` IN lv_args WITH mv_url.
    ELSEIF lv_args CS `%1`.
      REPLACE ALL OCCURRENCES OF `%1` IN lv_args WITH |"{ mv_url }"|.
    ELSE.
      lv_args = |{ lv_args } "{ mv_url }"|.
    ENDIF.
    " placeholders some browsers register (%*, %L, %I) are not needed
    REPLACE ALL OCCURRENCES OF REGEX `%[*LI0-9]` IN lv_args WITH ``.

    rv_ok = run( iv_application = lv_exe iv_parameter = condense( lv_args ) ).
  ENDMETHOD.


  METHOD run.
    cl_gui_frontend_services=>execute(
      EXPORTING
        application            = iv_application
        parameter              = iv_parameter
      EXCEPTIONS
        cntl_error             = 1
        error_no_gui           = 2
        bad_parameter          = 3
        file_not_found         = 4
        path_not_found         = 5
        file_extension_unknown = 6
        error_execute_failed   = 7
        synchronous_failed     = 8
        not_supported_by_gui   = 9
        OTHERS                 = 10 ).
    rv_ok = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.

ENDCLASS.


START-OF-SELECTION.
  DATA lv_host     TYPE string.
  DATA lv_port     TYPE string.
  DATA lv_protocol TYPE string.
  DATA lv_laiso    TYPE laiso.

  cl_http_server=>get_location(
    EXPORTING
      application  = c_path
    IMPORTING
      host         = lv_host
      port         = lv_port
      out_protocol = lv_protocol ).

  IF lv_host IS INITIAL.
    MESSAGE 'No HTTP(S) port found: check transaction SMICM / service activation in SICF' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.
  IF lv_protocol IS INITIAL.
    lv_protocol = 'https'.
  ENDIF.

  CALL FUNCTION 'CONVERSION_EXIT_ISOLA_OUTPUT'
    EXPORTING
      input  = sy-langu
    IMPORTING
      output = lv_laiso.

  DATA(lv_url) = |{ to_lower( lv_protocol ) }://{ lv_host }{ COND #( WHEN lv_port IS NOT INITIAL THEN |:{ lv_port }| ) }{ c_path }| &&
                 |?sap-client={ sy-mandt }&sap-language={ lv_laiso }|.

  DATA(lv_how) = NEW lcl_launcher( iv_url = lv_url iv_protocol = lv_protocol )->open( ).
  IF lv_how IS NOT INITIAL.
    MESSAGE |ZSMARTFORMS opened ({ lv_how }): { lv_url }| TYPE 'S'.
    RETURN.
  ENDIF.

  " no browser could be started: put the URL into the clipboard
  DATA lt_clip TYPE STANDARD TABLE OF char255 WITH EMPTY KEY.
  DATA lv_rc   TYPE i.
  lt_clip = VALUE #( ( CONV char255( lv_url ) ) ).
  cl_gui_frontend_services=>clipboard_export(
    IMPORTING
      data   = lt_clip
    CHANGING
      rc     = lv_rc
    EXCEPTIONS
      OTHERS = 1 ).
  MESSAGE |No browser could be started. URL copied to clipboard: { lv_url }| TYPE 'I'.
