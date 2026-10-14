"! <p>ICF handler of service /sap/bc/zsmartforms (SICF).</p>
"! <ul>
"! <li>GET  /sap/bc/zsmartforms                     the editor page (SMW0 binary object ZSMARTFORMS_HTML)</li>
"! <li>GET  /sap/bc/zsmartforms/api/list?type=&search=   forms, text modules, styles (JSON)</li>
"! <li>GET  /sap/bc/zsmartforms/api/form/NAME        form / text module XML</li>
"! <li>PUT  /sap/bc/zsmartforms/api/form/NAME?transport=&devclass=&activate=X   save (JSON result)</li>
"! <li>GET  /sap/bc/zsmartforms/api/form/NAME/fm     generated function module (JSON)</li>
"! <li>GET  /sap/bc/zsmartforms/api/style/NAME       style XML</li>
"! <li>PUT  /sap/bc/zsmartforms/api/style/NAME?...   save style (JSON result)</li>
"! <li>DELETE /sap/bc/zsmartforms/api/form/NAME?transport=   /style/NAME   delete in SAP (JSON result)</li>
"! </ul>
"! Writing requests must carry header X-Requested-With: ZSMARTFORMS (CSRF protection:
"! a foreign page cannot send this header to SAP without a CORS preflight).
CLASS zcl_smartforms_http DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_http_extension.

    CONSTANTS c_page_objid TYPE w3objid VALUE 'ZSMARTFORMS_HTML'.

  PROTECTED SECTION.
  PRIVATE SECTION.
    DATA mo_server TYPE REF TO if_http_server.
    DATA mo_io     TYPE REF TO zcl_smartforms_io.

    METHODS serve_page.
    METHODS route_api
      IMPORTING iv_method TYPE string
                iv_path   TYPE string.
    METHODS send_xml
      IMPORTING iv_xml     TYPE xstring
                iv_message TYPE string
                iv_name    TYPE string.
    METHODS send_result
      IMPORTING is_result TYPE zcl_smartforms_io=>ty_result.
    METHODS send_json
      IMPORTING iv_json   TYPE string
                iv_status TYPE i DEFAULT 200.
    METHODS send_error
      IMPORTING iv_message TYPE string
                iv_status  TYPE i DEFAULT 400.
    METHODS json_string
      IMPORTING iv_value       TYPE csequence
      RETURNING VALUE(rv_json) TYPE string.
    METHODS field
      IMPORTING iv_name       TYPE string
      RETURNING VALUE(rv_val) TYPE string.
ENDCLASS.



CLASS zcl_smartforms_http IMPLEMENTATION.


  METHOD if_http_extension~handle_request.
    mo_server = server.
    mo_io     = NEW #( ).

    DATA(lv_method) = to_upper( server->request->get_header_field( '~request_method' ) ).
    DATA(lv_path)   = server->request->get_header_field( '~path_info' ).

    TRY.
        IF lv_path IS INITIAL OR lv_path = `/` OR lv_path CP `/index.htm*` OR lv_path CP `/zsmartforms.htm*`.
          IF lv_method <> `GET` AND lv_method <> `HEAD`.
            send_error( iv_message = `Method not allowed` iv_status = 405 ).
          ELSE.
            serve_page( ).
          ENDIF.
        ELSEIF lv_path CP `/api/*`.
          route_api( iv_method = lv_method iv_path = substring( val = lv_path off = 4 ) ).
        ELSE.
          send_error( iv_message = |Not found: { lv_path }| iv_status = 404 ).
        ENDIF.
      CATCH cx_root INTO DATA(lx).
        send_error( iv_message = lx->get_text( ) iv_status = 500 ).
    ENDTRY.
  ENDMETHOD.


  METHOD serve_page.
    DATA ls_key   TYPE wwwdatatab.
    DATA lt_mime  TYPE STANDARD TABLE OF w3mime.
    DATA lv_size  TYPE wwwparams-value.
    DATA lv_html  TYPE xstring.

    ls_key-relid = 'MI'.
    ls_key-objid = c_page_objid.
    CALL FUNCTION 'WWWDATA_IMPORT'
      EXPORTING
        key               = ls_key
      TABLES
        mime              = lt_mime
      EXCEPTIONS
        wrong_object_type = 1
        import_error      = 2
        OTHERS            = 3.
    IF sy-subrc <> 0 OR lt_mime IS INITIAL.
      send_error( iv_message = |Upload the editor page with transaction SMW0 (binary data, object { c_page_objid })| iv_status = 404 ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'WWWPARAMS_READ'
      EXPORTING
        relid            = 'MI'
        objid            = c_page_objid
        name             = 'filesize'
      IMPORTING
        value            = lv_size
      EXCEPTIONS
        entry_not_exists = 1
        OTHERS           = 2.

    LOOP AT lt_mime INTO DATA(ls_line).
      CONCATENATE lv_html ls_line-line INTO lv_html IN BYTE MODE.
    ENDLOOP.
    DATA(lv_len) = CONV i( condense( lv_size ) ).
    IF lv_len > 0 AND lv_len < xstrlen( lv_html ).
      lv_html = lv_html(lv_len).
    ENDIF.

    mo_server->response->set_status( code = 200 reason = 'OK' ).
    mo_server->response->set_header_field( name = 'Content-Type' value = 'text/html; charset=utf-8' ).
    mo_server->response->set_header_field( name = 'Cache-Control' value = 'no-cache' ).
    mo_server->response->set_header_field( name = 'X-Content-Type-Options' value = 'nosniff' ).
    mo_server->response->set_data( lv_html ).
  ENDMETHOD.


  METHOD route_api.
    " iv_path: /list, /form/NAME, /form/NAME/fm, /style/NAME   (NAME may contain / for namespaces)
    IF iv_method <> `GET` AND iv_method <> `HEAD`.
      IF to_upper( mo_server->request->get_header_field( 'x-requested-with' ) ) <> `ZSMARTFORMS`.
        send_error( iv_message = `Missing header X-Requested-With: ZSMARTFORMS` iv_status = 403 ).
        RETURN.
      ENDIF.
    ENDIF.

    IF iv_path = `/list`.
      DATA(lt_list) = mo_io->list( iv_type   = to_upper( field( `type` ) )
                                   iv_search = field( `search` ) ).
      DATA(lv_json) = `[`.
      LOOP AT lt_list INTO DATA(ls_obj).
        lv_json = lv_json && COND #( WHEN sy-tabix > 1 THEN `,` ) &&
          |\{"type":{ json_string( ls_obj-type ) },"name":{ json_string( ls_obj-name ) },"caption":{ json_string( ls_obj-caption ) },| &&
          |"devclass":{ json_string( ls_obj-devclass ) },"lastuser":{ json_string( ls_obj-lastuser ) },"lastdate":{ json_string( ls_obj-lastdate ) }\}|.
      ENDLOOP.
      send_json( lv_json && `]` ).
      RETURN.
    ENDIF.

    DATA(lv_kind) = COND string( WHEN iv_path CP `/form/*`  THEN `form`
                                 WHEN iv_path CP `/style/*` THEN `style` ).
    IF lv_kind IS INITIAL.
      send_error( iv_message = |Unknown API path { iv_path }| iv_status = 404 ).
      RETURN.
    ENDIF.
    DATA(lv_rest) = substring_after( val = iv_path sub = |/{ lv_kind }/| ).
    lv_rest = cl_http_utility=>unescape_url( lv_rest ).
    DATA(lv_fm) = abap_false.
    IF lv_kind = `form` AND lv_rest CP `*/fm`.
      lv_fm   = abap_true.
      lv_rest = substring( val = lv_rest len = strlen( lv_rest ) - 3 ).
    ENDIF.
    DATA(lv_name) = to_upper( condense( lv_rest ) ).
    IF lv_name IS INITIAL OR strlen( lv_name ) > 30.
      send_error( `Invalid object name` ).
      RETURN.
    ENDIF.

    DATA(lv_activate)  = xsdbool( to_upper( field( `activate` ) ) = `X` OR field( `activate` ) = `true` ).
    DATA(lv_transport) = CONV trkorr( to_upper( field( `transport` ) ) ).
    DATA(lv_devclass)  = CONV devclass( to_upper( field( `devclass` ) ) ).

    CASE iv_method.
      WHEN `GET` OR `HEAD`.
        IF lv_fm = abap_true.
          send_result( mo_io->function_module_name( CONV tdsfname( lv_name ) ) ).
        ELSEIF lv_kind = `form`.
          mo_io->read_form( EXPORTING iv_name = CONV tdsfname( lv_name )
                            IMPORTING ev_xml = DATA(lv_fxml) ev_message = DATA(lv_fmsg) ).
          send_xml( iv_xml = lv_fxml iv_message = lv_fmsg iv_name = lv_name ).
        ELSE.
          mo_io->read_style( EXPORTING iv_name = CONV tdssname( lv_name )
                             IMPORTING ev_xml = DATA(lv_sxml) ev_message = DATA(lv_smsg) ).
          send_xml( iv_xml = lv_sxml iv_message = lv_smsg iv_name = lv_name ).
        ENDIF.

      WHEN `PUT` OR `POST`.
        DATA(lv_body) = mo_server->request->get_data( ).
        IF lv_kind = `form`.
          send_result( mo_io->save_form( iv_name      = CONV tdsfname( lv_name )
                                         iv_xml       = lv_body
                                         iv_transport = lv_transport
                                         iv_devclass  = lv_devclass
                                         iv_activate  = lv_activate ) ).
        ELSE.
          send_result( mo_io->save_style( iv_name      = CONV tdssname( lv_name )
                                          iv_xml       = lv_body
                                          iv_transport = lv_transport
                                          iv_devclass  = lv_devclass
                                          iv_activate  = lv_activate ) ).
        ENDIF.

      WHEN `DELETE`.
        IF lv_kind = `form`.
          send_result( mo_io->delete_form( iv_name = CONV tdsfname( lv_name ) iv_transport = lv_transport ) ).
        ELSE.
          send_result( mo_io->delete_style( iv_name = CONV tdssname( lv_name ) iv_transport = lv_transport ) ).
        ENDIF.

      WHEN OTHERS.
        send_error( iv_message = `Method not allowed` iv_status = 405 ).
    ENDCASE.
  ENDMETHOD.


  METHOD send_xml.
    IF iv_xml IS INITIAL.
      send_error( iv_message = COND #( WHEN iv_message IS NOT INITIAL THEN iv_message ELSE |{ iv_name } not found| ) iv_status = 404 ).
      RETURN.
    ENDIF.
    mo_server->response->set_status( code = 200 reason = 'OK' ).
    mo_server->response->set_header_field( name = 'Content-Type' value = 'application/xml; charset=utf-8' ).
    mo_server->response->set_header_field( name = 'Cache-Control' value = 'no-store' ).
    mo_server->response->set_data( iv_xml ).
  ENDMETHOD.


  METHOD send_result.
    DATA(lv_msgs) = ``.
    LOOP AT is_result-messages INTO DATA(lv_m).
      lv_msgs = lv_msgs && COND #( WHEN sy-tabix > 1 THEN `,` ) && json_string( lv_m ).
    ENDLOOP.
    DATA(lv_json) =
      |\{"ok":{ COND #( WHEN is_result-ok = abap_true THEN `true` ELSE `false` ) },| &&
      |"message":{ json_string( is_result-message ) },"messages":[{ lv_msgs }],| &&
      |"active":{ COND #( WHEN is_result-active = abap_true THEN `true` ELSE `false` ) },| &&
      |"devclass":{ json_string( is_result-devclass ) },"korrnum":{ json_string( is_result-korrnum ) },| &&
      |"fm_name":{ json_string( is_result-fm_name ) }\}|.
    send_json( iv_json = lv_json iv_status = COND #( WHEN is_result-ok = abap_true THEN 200 ELSE 422 ) ).
  ENDMETHOD.


  METHOD send_json.
    mo_server->response->set_status( code = iv_status reason = COND #( WHEN iv_status = 200 THEN `OK` ELSE `Error` ) ).
    mo_server->response->set_header_field( name = 'Content-Type' value = 'application/json; charset=utf-8' ).
    mo_server->response->set_header_field( name = 'Cache-Control' value = 'no-store' ).
    mo_server->response->set_cdata( iv_json ).
  ENDMETHOD.


  METHOD send_error.
    send_json( iv_json   = |\{"ok":false,"message":{ json_string( iv_message ) },"messages":[]\}|
               iv_status = iv_status ).
  ENDMETHOD.


  METHOD json_string.
    DATA(lv) = CONV string( iv_value ).
    REPLACE ALL OCCURRENCES OF `\` IN lv WITH `\\`.
    REPLACE ALL OCCURRENCES OF `"` IN lv WITH `\"`.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>cr_lf IN lv WITH `\n`.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>newline IN lv WITH `\n`.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>horizontal_tab IN lv WITH `\t`.
    rv_json = |"{ lv }"|.
  ENDMETHOD.


  METHOD field.
    rv_val = mo_server->request->get_form_field( iv_name ).
  ENDMETHOD.

ENDCLASS.
