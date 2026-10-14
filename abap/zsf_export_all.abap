*&---------------------------------------------------------------------*
*& Report ZSF_EXPORT_ALL
*&---------------------------------------------------------------------*
*& Exports customer Smart Forms, text modules and Smart Styles as XML
*& (byte-identical to SMARTFORMS -> Utilities -> Download) into ONE zip:
*&   forms/<name>.xml, textmodules/<name>.xml, styles/<name>.xml,
*&   index.txt (name, type, package, last change, size, result)
*& Read-only: nothing is locked, changed or generated.
*& SAP_BASIS 7.40 SP08+.
*&---------------------------------------------------------------------*
REPORT zsf_export_all.

TABLES: stxfadm, stxsadm.

SELECT-OPTIONS:
  s_form  FOR stxfadm-formname,
  s_style FOR stxsadm-stylename,
  s_devc  FOR stxfadm-devclass.
PARAMETERS:
  p_forms AS CHECKBOX DEFAULT abap_true,
  p_texts AS CHECKBOX DEFAULT abap_true,
  p_style AS CHECKBOX DEFAULT abap_true,
  p_max   TYPE i DEFAULT 2000,
  p_file  TYPE string LOWER CASE DEFAULT 'C:\temp\zsf_export_all.zip'.

INITIALIZATION.
  s_form[]  = VALUE #( sign = 'I' option = 'CP' ( low = 'Z*' ) ( low = 'Y*' ) ).
  s_style[] = VALUE #( sign = 'I' option = 'CP' ( low = 'Z*' ) ( low = 'Y*' ) ).


CLASS lcl_export DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS run.

  PRIVATE SECTION.
    CONSTANTS:
      c_ns_form  TYPE string VALUE 'urn:sap-com:SmartForms:2000:internal-structure',
      c_ns_style TYPE string VALUE 'urn:sap-com:SmartForms:2000:style-internal-structure',
      c_ns_ifr   TYPE string VALUE 'urn:sap-com:sdixml-ifr:2000'.

    TYPES: BEGIN OF ty_arg,
             name  TYPE string,
             value TYPE string,
           END OF ty_arg,
           tt_arg TYPE STANDARD TABLE OF ty_arg WITH EMPTY KEY.
    TYPES: BEGIN OF ty_res,
             name TYPE string,
             kind TYPE c LENGTH 1,
             ref  TYPE REF TO data,
           END OF ty_res,
           tt_res TYPE STANDARD TABLE OF ty_res WITH EMPTY KEY.

    DATA mo_zip   TYPE REF TO cl_abap_zip.
    DATA mo_ixml  TYPE REF TO if_ixml.
    DATA mt_index TYPE string_table.
    DATA mv_ok    TYPE i.
    DATA mv_err   TYPE i.

    METHODS export_forms.
    METHODS export_styles.
    METHODS form_xml
      IMPORTING iv_name       TYPE tdsfname
                iv_langu      TYPE sylangu
      RETURNING VALUE(rv_xml) TYPE xstring
      RAISING   cx_static_check.
    METHODS style_xml
      IMPORTING iv_name       TYPE tdssname
                iv_langu      TYPE sylangu
      EXPORTING ev_xml        TYPE xstring
                ev_msg        TYPE string.
    METHODS add_root_attributes
      IMPORTING io_root  TYPE REF TO if_ixml_element
                iv_ns    TYPE string
                iv_langu TYPE sylangu.
    METHODS dom_to_xstring
      IMPORTING io_doc        TYPE REF TO if_ixml_document
      RETURNING VALUE(rv_xml) TYPE xstring.
    METHODS add_file
      IMPORTING iv_folder TYPE string
                iv_name   TYPE csequence
                iv_xml    TYPE xstring.
    METHODS log
      IMPORTING iv_type   TYPE string
                iv_name   TYPE csequence
                iv_devc   TYPE csequence
                iv_date   TYPE csequence
                iv_size   TYPE i
                iv_result TYPE string.
    METHODS comp
      IMPORTING is_data       TYPE any
                iv_name       TYPE string
      RETURNING VALUE(rv_val) TYPE string.
    METHODS call_dynamic
      IMPORTING iv_func TYPE rs38l_fnam
                it_args TYPE tt_arg
      EXPORTING et_res  TYPE tt_res
                ev_rc   TYPE i
                ev_msg  TYPE string.
    METHODS new_data
      IMPORTING iv_type        TYPE csequence
                iv_table       TYPE abap_bool
      RETURNING VALUE(rr_data) TYPE REF TO data.
    METHODS res_ref
      IMPORTING it_res         TYPE tt_res
                iv_name        TYPE string
      RETURNING VALUE(rr_data) TYPE REF TO data.
ENDCLASS.


CLASS lcl_export IMPLEMENTATION.

  METHOD run.
    mo_zip  = NEW #( ).
    mo_ixml = cl_ixml=>create( ).
    APPEND |TYPE        NAME                            PACKAGE                         CHANGED     BYTES     RESULT| TO mt_index.

    IF p_forms = abap_true OR p_texts = abap_true.
      export_forms( ).
    ENDIF.
    IF p_style = abap_true.
      export_styles( ).
    ENDIF.

    APPEND `` TO mt_index.
    APPEND |Exported: { mv_ok }   Failed: { mv_err }   System: { sy-sysid }/{ sy-mandt }   { sy-datum DATE = ISO } { sy-uzeit TIME = ISO }| TO mt_index.
    DATA(lv_index) = concat_lines_of( table = mt_index sep = cl_abap_char_utilities=>cr_lf ).
    mo_zip->add( name    = 'index.txt'
                 content = cl_abap_codepage=>convert_to( lv_index ) ).

    DATA(lv_zip) = mo_zip->save( ).
    DATA(lt_bin) = cl_bcs_convert=>xstring_to_solix( lv_zip ).
    cl_gui_frontend_services=>gui_download(
      EXPORTING
        filename     = p_file
        filetype     = 'BIN'
        bin_filesize = xstrlen( lv_zip )
      CHANGING
        data_tab     = lt_bin
      EXCEPTIONS
        OTHERS       = 1 ).
    IF sy-subrc = 0.
      MESSAGE |{ p_file }: { mv_ok } objects, { mv_err } failed, { xstrlen( lv_zip ) } bytes| TYPE 'S'.
    ELSE.
      MESSAGE |Download to { p_file } failed| TYPE 'S' DISPLAY LIKE 'E'.
    ENDIF.

    LOOP AT mt_index INTO DATA(lv_line).
      WRITE / lv_line.
    ENDLOOP.
  ENDMETHOD.


  METHOD export_forms.
    DATA lt_adm TYPE STANDARD TABLE OF stxfadm WITH DEFAULT KEY.

    SELECT * FROM stxfadm INTO TABLE @lt_adm
      WHERE formname IN @s_form AND devclass IN @s_devc
      ORDER BY formname.

    LOOP AT lt_adm INTO DATA(ls_adm).
      IF mv_ok + mv_err >= p_max.
        EXIT.
      ENDIF.
      " Form type: ' ' = form, 'T' = text module, others (CRM ...) as forms
      DATA(lv_ftype) = comp( is_data = ls_adm iv_name = `FORMTYPE` ).
      DATA(lv_is_text) = xsdbool( lv_ftype = `T` ).
      IF lv_is_text = abap_true AND p_texts = abap_false.
        CONTINUE.
      ENDIF.
      IF lv_is_text = abap_false AND p_forms = abap_false.
        CONTINUE.
      ENDIF.

      DATA(lv_type)   = COND string( WHEN lv_is_text = abap_true THEN `TEXTMODULE` ELSE `FORM` ).
      DATA(lv_folder) = COND string( WHEN lv_is_text = abap_true THEN `textmodules` ELSE `forms` ).
      DATA(lv_langu)  = CONV sylangu( comp( is_data = ls_adm iv_name = `MASTERLANG` ) ).
      IF lv_langu IS INITIAL.
        lv_langu = sy-langu.
      ENDIF.
      DATA(lv_date) = comp( is_data = ls_adm iv_name = `LASTDATE` ).

      TRY.
          DATA(lv_xml) = form_xml( iv_name = ls_adm-formname iv_langu = lv_langu ).
          add_file( iv_folder = lv_folder iv_name = ls_adm-formname iv_xml = lv_xml ).
          log( iv_type = lv_type iv_name = ls_adm-formname iv_devc = ls_adm-devclass
               iv_date = lv_date iv_size = xstrlen( lv_xml ) iv_result = `OK` ).
          mv_ok = mv_ok + 1.
        CATCH cx_root INTO DATA(lx).
          log( iv_type = lv_type iv_name = ls_adm-formname iv_devc = ls_adm-devclass
               iv_date = lv_date iv_size = 0 iv_result = |ERROR { lx->get_text( ) }| ).
          mv_err = mv_err + 1.
      ENDTRY.
    ENDLOOP.
  ENDMETHOD.


  METHOD form_xml.
    DATA lo_form TYPE REF TO cl_ssf_fb_smart_form.

    CREATE OBJECT lo_form.
    lo_form->load( im_formname = iv_name
                   im_language = iv_langu ).

    DATA(lo_doc) = mo_ixml->create_document( ).
    lo_form->xml_init( ).
    lo_form->xml_download( EXPORTING parent   = lo_doc
                           CHANGING  document = lo_doc ).

    add_root_attributes( io_root = lo_doc->get_root_element( ) iv_ns = c_ns_form iv_langu = iv_langu ).
    rv_xml = dom_to_xstring( lo_doc ).
    FREE lo_form.
  ENDMETHOD.


  METHOD export_styles.
    DATA lt_adm TYPE STANDARD TABLE OF stxsadm WITH DEFAULT KEY.

    SELECT * FROM stxsadm INTO TABLE @lt_adm
      WHERE stylename IN @s_style
      ORDER BY stylename.
    DELETE ADJACENT DUPLICATES FROM lt_adm COMPARING stylename.

    LOOP AT lt_adm INTO DATA(ls_adm).
      IF mv_ok + mv_err >= p_max.
        EXIT.
      ENDIF.
      DATA(lv_devc) = comp( is_data = ls_adm iv_name = `DEVCLASS` ).
      IF s_devc[] IS NOT INITIAL AND lv_devc NOT IN s_devc.
        CONTINUE.
      ENDIF.
      DATA(lv_langu) = CONV sylangu( comp( is_data = ls_adm iv_name = `MASTERLANG` ) ).
      IF lv_langu IS INITIAL.
        lv_langu = sy-langu.
      ENDIF.
      DATA(lv_date) = comp( is_data = ls_adm iv_name = `LASTDATE` ).

      style_xml( EXPORTING iv_name  = ls_adm-stylename
                           iv_langu = lv_langu
                 IMPORTING ev_xml   = DATA(lv_xml)
                           ev_msg   = DATA(lv_msg) ).
      IF lv_xml IS NOT INITIAL.
        add_file( iv_folder = `styles` iv_name = ls_adm-stylename iv_xml = lv_xml ).
        log( iv_type = `STYLE` iv_name = ls_adm-stylename iv_devc = lv_devc
             iv_date = lv_date iv_size = xstrlen( lv_xml ) iv_result = `OK` ).
        mv_ok = mv_ok + 1.
      ELSE.
        log( iv_type = `STYLE` iv_name = ls_adm-stylename iv_devc = lv_devc
             iv_date = lv_date iv_size = 0 iv_result = |ERROR { lv_msg }| ).
        mv_err = mv_err + 1.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD style_xml.
    DATA lt_res TYPE tt_res.
    DATA lv_rc  TYPE i.
    FIELD-SYMBOLS <lv_data> TYPE any.

    CLEAR: ev_xml, ev_msg.

    " Active version first, inactive as fallback (same order as the Style Builder)
    DATA(lt_flags) = VALUE string_table( ( `A` ) ( `I` ) ( `` ) ).
    LOOP AT lt_flags INTO DATA(lv_flag).
      call_dynamic( EXPORTING iv_func = 'SSF_READ_STYLE'
                              it_args = VALUE #( ( name = `I_STYLE_NAME`        value = iv_name )
                                                 ( name = `I_STYLE_ACTIVE_FLAG` value = lv_flag )
                                                 ( name = `I_STYLE_VARIANT`     value = `` )
                                                 ( name = `I_STYLE_LANGUAGE`    value = iv_langu ) )
                    IMPORTING et_res  = lt_res
                              ev_rc   = lv_rc
                              ev_msg  = ev_msg ).
      IF lv_rc = 0.
        EXIT.
      ENDIF.
    ENDLOOP.
    IF lv_rc <> 0.
      ev_msg = |SSF_READ_STYLE { lv_rc } { ev_msg }|.
      RETURN.
    ENDIF.

    DATA(lo_doc)  = mo_ixml->create_document( ).
    DATA(lo_root) = lo_doc->create_simple_element( name = 'SMARTSTYLE' parent = lo_doc ).
    lo_root->set_namespace_prefix( prefix = 'sf' ).
    add_root_attributes( io_root = lo_root iv_ns = c_ns_style iv_langu = iv_langu ).

    " Same element order as XML_DOWNLOAD_STYLE in the Style Builder
    DATA(lt_parts) = VALUE string_table( ( `HEADER` ) ( `PARAGRAPHS` ) ( `STRINGS` ) ( `TABSTOPS` ) ).
    DATA(lt_params) = VALUE string_table( ( `E_HEADER` ) ( `E_PARAGRAPHS` ) ( `E_STRINGS` ) ( `E_TABSTOPS` ) ).
    LOOP AT lt_parts INTO DATA(lv_part).
      DATA(lv_idx) = sy-tabix.
      DATA(lr_data) = res_ref( it_res = lt_res iv_name = lt_params[ lv_idx ] ).
      IF lr_data IS NOT BOUND.
        ev_msg = |SSF_READ_STYLE has no parameter { lt_params[ lv_idx ] }|.
        RETURN.
      ENDIF.
      ASSIGN lr_data->* TO <lv_data>.

      DATA lo_part TYPE REF TO if_ixml_element.
      CLEAR lo_part.
      CALL FUNCTION 'SDIXML_DATA_TO_DOM'
        EXPORTING
          name        = CONV string( lv_part )
          dataobject  = <lv_data>
        IMPORTING
          data_as_dom = lo_part
        CHANGING
          document    = lo_doc
        EXCEPTIONS
          OTHERS      = 1.
      IF sy-subrc <> 0 OR lo_part IS NOT BOUND.
        ev_msg = |SDIXML_DATA_TO_DOM failed for { lv_part }|.
        RETURN.
      ENDIF.
      lo_part->set_namespace_prefix( prefix = 'sf' ).
      lo_root->append_child( new_child = lo_part ).
    ENDLOOP.

    ev_xml = dom_to_xstring( lo_doc ).
  ENDMETHOD.


  METHOD add_root_attributes.
    DATA lv_laiso TYPE laiso.
    CALL FUNCTION 'CONVERSION_EXIT_ISOLA_OUTPUT'
      EXPORTING
        input  = iv_langu
      IMPORTING
        output = lv_laiso.
    io_root->set_attribute( name = 'sf' namespace = 'xmlns' value = iv_ns ).
    io_root->set_attribute( name = 'xmlns' value = c_ns_ifr ).
    io_root->set_attribute( name = 'language' namespace = 'sf' value = CONV string( lv_laiso ) ).
  ENDMETHOD.


  METHOD dom_to_xstring.
    CALL FUNCTION 'SDIXML_DOM_TO_XML'
      EXPORTING
        document      = io_doc
      IMPORTING
        xml_as_string = rv_xml
      EXCEPTIONS
        OTHERS        = 1.
    IF sy-subrc <> 0.
      CLEAR rv_xml.
    ENDIF.
  ENDMETHOD.


  METHOD add_file.
    " Namespaced names (/ABC/FORM) -> #ABC#FORM, like the SAP download proposal
    DATA(lv_name) = to_lower( replace( val = condense( CONV string( iv_name ) ) sub = '/' with = '#' occ = 0 ) ).
    mo_zip->add( name    = |{ iv_folder }/{ lv_name }.xml|
                 content = iv_xml ).
  ENDMETHOD.


  METHOD log.
    APPEND |{ iv_type WIDTH = 11 } { iv_name WIDTH = 31 } { iv_devc WIDTH = 31 } { iv_date WIDTH = 11 } |
        && |{ iv_size WIDTH = 9 ALIGN = RIGHT } { iv_result }| TO mt_index.
  ENDMETHOD.


  METHOD comp.
    FIELD-SYMBOLS <lv_val> TYPE any.
    ASSIGN COMPONENT iv_name OF STRUCTURE is_data TO <lv_val>.
    IF sy-subrc = 0.
      rv_val = |{ <lv_val> }|.
    ENDIF.
  ENDMETHOD.


  METHOD call_dynamic.
    " Actual parameters are created from the FM's own signature (FUPARAREF)
    TYPES: BEGIN OF ty_par,
             parameter TYPE fupararef-parameter,
             paramtype TYPE fupararef-paramtype,
             structure TYPE fupararef-structure,
           END OF ty_par.
    DATA lt_par  TYPE STANDARD TABLE OF ty_par WITH EMPTY KEY.
    DATA lt_ptab TYPE abap_func_parmbind_tab.
    DATA lt_etab TYPE abap_func_excpbind_tab.
    DATA lr_data TYPE REF TO data.
    DATA lv_exc  TYPE i.
    FIELD-SYMBOLS <lv_any> TYPE any.

    CLEAR: et_res, ev_rc, ev_msg.
    SELECT parameter, paramtype, structure FROM fupararef INTO TABLE @lt_par
      WHERE funcname = @iv_func AND r3state = 'A'.
    IF sy-subrc <> 0.
      ev_rc  = -1.
      ev_msg = |{ iv_func } has no active signature|.
      RETURN.
    ENDIF.

    LOOP AT lt_par INTO DATA(ls_par).
      DATA(lv_pname) = CONV string( ls_par-parameter ).
      CLEAR lr_data.
      READ TABLE it_args INTO DATA(ls_arg) WITH KEY name = lv_pname.
      DATA(lv_has_arg) = xsdbool( sy-subrc = 0 ).

      CASE ls_par-paramtype.
        WHEN 'I'.
          CHECK lv_has_arg = abap_true.
          lr_data = new_data( iv_type = ls_par-structure iv_table = abap_false ).
          IF lr_data IS NOT BOUND.
            CREATE DATA lr_data TYPE string.
          ENDIF.
          ASSIGN lr_data->* TO <lv_any>.
          <lv_any> = ls_arg-value.
          INSERT VALUE #( name = ls_par-parameter kind = abap_func_exporting value = lr_data ) INTO TABLE lt_ptab.

        WHEN 'E' OR 'C' OR 'T'.
          lr_data = new_data( iv_type = ls_par-structure iv_table = xsdbool( ls_par-paramtype = 'T' ) ).
          IF lr_data IS NOT BOUND.
            CASE ls_par-paramtype.
              WHEN 'T'.
                CREATE DATA lr_data TYPE string_table.
              WHEN 'C'.
                CREATE DATA lr_data TYPE string.
              WHEN OTHERS.
                CONTINUE.
            ENDCASE.
          ENDIF.
          IF ls_par-paramtype = 'C' AND lv_has_arg = abap_true.
            ASSIGN lr_data->* TO <lv_any>.
            <lv_any> = ls_arg-value.
          ENDIF.
          INSERT VALUE #( name  = ls_par-parameter
                          kind  = SWITCH #( ls_par-paramtype
                                            WHEN 'E' THEN abap_func_importing
                                            WHEN 'C' THEN abap_func_changing
                                            ELSE          abap_func_tables )
                          value = lr_data ) INTO TABLE lt_ptab.
          APPEND VALUE #( name = lv_pname kind = ls_par-paramtype ref = lr_data ) TO et_res.

        WHEN 'X'.
          lv_exc = lv_exc + 1.
          INSERT VALUE #( name = ls_par-parameter value = lv_exc ) INTO TABLE lt_etab.
      ENDCASE.
    ENDLOOP.
    INSERT VALUE #( name = 'OTHERS' value = 99 ) INTO TABLE lt_etab.
    INSERT VALUE #( name = 'ERROR_MESSAGE' value = 98 ) INTO TABLE lt_etab.

    TRY.
        CALL FUNCTION iv_func
          PARAMETER-TABLE lt_ptab
          EXCEPTION-TABLE lt_etab.
        ev_rc = sy-subrc.
        IF ev_rc <> 0.
          LOOP AT lt_etab INTO DATA(ls_exc) WHERE value = ev_rc.
            ev_msg = ls_exc-name.
          ENDLOOP.
          IF ev_rc = 98.
            MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
                    WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_msg.
          ENDIF.
        ENDIF.
      CATCH cx_sy_dyn_call_error INTO DATA(lx_call).
        ev_rc  = -2.
        ev_msg = lx_call->get_text( ).
    ENDTRY.
  ENDMETHOD.


  METHOD new_data.
    DATA lo_type TYPE REF TO cl_abap_typedescr.
    DATA lo_data TYPE REF TO cl_abap_datadescr.

    CHECK iv_type IS NOT INITIAL.
    TRY.
        IF iv_type CS '-'.
          SPLIT iv_type AT '-' INTO DATA(lv_tab) DATA(lv_fld).
          cl_abap_typedescr=>describe_by_name( EXPORTING  p_name      = lv_tab
                                               RECEIVING  p_descr_ref = lo_type
                                               EXCEPTIONS type_not_found = 1
                                                          OTHERS         = 2 ).
          CHECK sy-subrc = 0.
          DATA(lo_struct) = CAST cl_abap_structdescr( lo_type ).
          lo_struct->get_component_type( EXPORTING  p_name      = lv_fld
                                         RECEIVING  p_descr_ref = lo_data
                                         EXCEPTIONS component_not_found    = 1
                                                    unsupported_input_type = 2
                                                    OTHERS                 = 3 ).
          CHECK sy-subrc = 0.
        ELSE.
          cl_abap_typedescr=>describe_by_name( EXPORTING  p_name      = iv_type
                                               RECEIVING  p_descr_ref = lo_type
                                               EXCEPTIONS type_not_found = 1
                                                          OTHERS         = 2 ).
          CHECK sy-subrc = 0.
          lo_data ?= lo_type.
        ENDIF.

        IF iv_table = abap_true AND lo_data->kind <> cl_abap_typedescr=>kind_table.
          DATA(lo_tab) = cl_abap_tabledescr=>create( p_line_type = lo_data ).
          CREATE DATA rr_data TYPE HANDLE lo_tab.
        ELSE.
          CREATE DATA rr_data TYPE HANDLE lo_data.
        ENDIF.
      CATCH cx_root.
        CLEAR rr_data.
    ENDTRY.
  ENDMETHOD.


  METHOD res_ref.
    READ TABLE it_res INTO DATA(ls_res) WITH KEY name = iv_name.
    IF sy-subrc = 0.
      rr_data = ls_res-ref.
    ENDIF.
  ENDMETHOD.

ENDCLASS.


START-OF-SELECTION.
  NEW lcl_export( )->run( ).
