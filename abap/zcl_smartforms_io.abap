"! <p>ZSMARTFORMS backend: reads and writes Smart Forms, text modules and
"! Smart Styles as XML without any dialog (no SAP GUI needed, callable from ICF).</p>
"! <ul>
"! <li>Read  = same bytes as SMARTFORMS / SMARTSTYLES -> Utilities -> Download</li>
"! <li>Write = same as Utilities -> Upload + Save (+ Check, Activate, Generate)</li>
"! </ul>
"! SAP_BASIS 7.40 SP08+. Package $TMP is fine (no transport needed for the tool itself).
CLASS zcl_smartforms_io DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES:
      BEGIN OF ty_result,
        ok       TYPE abap_bool,
        message  TYPE string,
        messages TYPE string_table,
        devclass TYPE devclass,
        korrnum  TYPE trkorr,
        active   TYPE abap_bool,
        fm_name  TYPE rs38l_fnam,
      END OF ty_result.
    TYPES:
      BEGIN OF ty_object,
        type     TYPE string,      " SF form, TM text module, SS style
        name     TYPE string,
        caption  TYPE string,
        devclass TYPE string,
        lastuser TYPE string,
        lastdate TYPE string,
      END OF ty_object,
      tt_object TYPE STANDARD TABLE OF ty_object WITH EMPTY KEY.

    CONSTANTS:
      c_ns_form  TYPE string VALUE 'urn:sap-com:SmartForms:2000:internal-structure',
      c_ns_style TYPE string VALUE 'urn:sap-com:SmartForms:2000:style-internal-structure',
      c_ns_ifr   TYPE string VALUE 'urn:sap-com:sdixml-ifr:2000'.

    METHODS read_form
      IMPORTING iv_name    TYPE tdsfname
      EXPORTING ev_xml     TYPE xstring
                ev_message TYPE string.

    METHODS read_style
      IMPORTING iv_name    TYPE tdssname
      EXPORTING ev_xml     TYPE xstring
                ev_message TYPE string.

    METHODS save_form
      IMPORTING iv_name          TYPE tdsfname
                iv_xml           TYPE xstring
                iv_transport     TYPE trkorr OPTIONAL
                iv_devclass      TYPE devclass OPTIONAL
                iv_activate      TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS save_style
      IMPORTING iv_name          TYPE tdssname
                iv_xml           TYPE xstring
                iv_transport     TYPE trkorr OPTIONAL
                iv_devclass      TYPE devclass OPTIONAL
                iv_activate      TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(rs_result) TYPE ty_result.

    "! Deletes a form / text module (FB_DELETE_FORM) without dialogs; transportable objects
    "! are first registered in the given request (deletion is transported with it)
    METHODS delete_form
      IMPORTING iv_name          TYPE tdsfname
                iv_transport     TYPE trkorr OPTIONAL
      RETURNING VALUE(rs_result) TYPE ty_result.

    "! Deletes a Smart Style (SSF_DELETE_STYLE) without dialogs
    METHODS delete_style
      IMPORTING iv_name          TYPE tdssname
                iv_transport     TYPE trkorr OPTIONAL
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS function_module_name
      IMPORTING iv_name          TYPE tdsfname
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS list
      IMPORTING iv_type          TYPE string      " SF, TM, SS or empty for all
                iv_search        TYPE string      " pattern, * allowed, default Z* and Y*
                iv_max           TYPE i DEFAULT 500
      RETURNING VALUE(rt_list)   TYPE tt_object.

  PROTECTED SECTION.
  PRIVATE SECTION.
    DATA mo_ixml TYPE REF TO if_ixml.

    METHODS ixml
      RETURNING VALUE(ro_ixml) TYPE REF TO if_ixml.
    METHODS parse
      IMPORTING iv_xml        TYPE xstring
      EXPORTING eo_doc        TYPE REF TO if_ixml_document
                ev_message    TYPE string.
    METHODS child
      IMPORTING io_parent     TYPE REF TO if_ixml_element
                iv_name       TYPE string
      RETURNING VALUE(ro_elem) TYPE REF TO if_ixml_element.
    METHODS child_value
      IMPORTING io_parent     TYPE REF TO if_ixml_element
                iv_name       TYPE string
      RETURNING VALUE(rv_val) TYPE string.
    METHODS xml_language
      IMPORTING io_root        TYPE REF TO if_ixml_element
                iv_ns          TYPE string
      RETURNING VALUE(rv_lang) TYPE sylangu.
    METHODS add_root_attributes
      IMPORTING io_root  TYPE REF TO if_ixml_element
                iv_ns    TYPE string
                iv_langu TYPE sylangu.
    METHODS dom_to_xstring
      IMPORTING io_doc        TYPE REF TO if_ixml_document
      RETURNING VALUE(rv_xml) TYPE xstring.
    METHODS corr_insert
      IMPORTING iv_object       TYPE csequence
                iv_class        TYPE trobjtype
                iv_new          TYPE abap_bool
                iv_masterlang   TYPE sylangu
                iv_transport    TYPE trkorr
      CHANGING  cv_devclass     TYPE devclass
                cs_result       TYPE ty_result
      RETURNING VALUE(rv_ok)    TYPE abap_bool.
    TYPES:
      BEGIN OF ty_pair,
        name  TYPE string,
        value TYPE string,
      END OF ty_pair,
      ty_pairs TYPE STANDARD TABLE OF ty_pair WITH EMPTY KEY.
    "! check messages as "E: node: text" / "W: …"; ev_errors = at least one error (not only warnings)
    METHODS check_messages
      IMPORTING ix_check  TYPE REF TO cx_root
                io_form   TYPE REF TO object
      EXPORTING et_text   TYPE string_table
                ev_errors TYPE abap_bool.
    METHODS collect_tables
      IMPORTING io_object TYPE REF TO object
                iv_owner  TYPE string
      CHANGING  ct_text   TYPE string_table
                ct_diag   TYPE string_table
                cv_errors TYPE abap_bool.
    METHODS row_text
      IMPORTING is_row      TYPE any
      EXPORTING ev_text     TYPE string
                ev_severity TYPE char1.
    METHODS flatten
      IMPORTING is_data  TYPE any
                iv_path  TYPE string
                iv_depth TYPE i
      CHANGING  ct_pairs TYPE ty_pairs.
    METHODS error_text
      IMPORTING ix_error       TYPE REF TO cx_root
      RETURNING VALUE(rv_text) TYPE string.
    METHODS sy_message
      RETURNING VALUE(rv_text) TYPE string.
    METHODS comp
      IMPORTING is_data       TYPE any
                iv_name       TYPE string
      RETURNING VALUE(rv_val) TYPE string.
    METHODS pattern
      IMPORTING iv_search      TYPE string
      RETURNING VALUE(rt_like) TYPE string_table.
ENDCLASS.



CLASS zcl_smartforms_io IMPLEMENTATION.


  METHOD ixml.
    IF mo_ixml IS NOT BOUND.
      mo_ixml = cl_ixml=>create( ).
    ENDIF.
    ro_ixml = mo_ixml.
  ENDMETHOD.


  METHOD read_form.
    DATA ls_adm  TYPE stxfadm.
    DATA lo_form TYPE REF TO cl_ssf_fb_smart_form.

    CLEAR: ev_xml, ev_message.
    SELECT SINGLE * FROM stxfadm INTO @ls_adm WHERE formname = @iv_name.
    IF sy-subrc <> 0.
      ev_message = |Form { iv_name } does not exist|.
      RETURN.
    ENDIF.
    DATA(lv_langu) = CONV sylangu( comp( is_data = ls_adm iv_name = `MASTERLANG` ) ).
    IF lv_langu IS INITIAL.
      lv_langu = sy-langu.
    ENDIF.

    TRY.
        CREATE OBJECT lo_form.
        lo_form->load( im_formname = iv_name
                       im_language = lv_langu ).
        DATA(lo_doc) = ixml( )->create_document( ).
        lo_form->xml_init( ).
        lo_form->xml_download( EXPORTING parent   = lo_doc
                               CHANGING  document = lo_doc ).
        add_root_attributes( io_root = lo_doc->get_root_element( ) iv_ns = c_ns_form iv_langu = lv_langu ).
        ev_xml = dom_to_xstring( lo_doc ).
        IF ev_xml IS INITIAL.
          ev_message = |Form { iv_name }: XML could not be created|.
        ENDIF.
      CATCH cx_root INTO DATA(lx).
        ev_message = |Form { iv_name }: { error_text( lx ) }|.
    ENDTRY.
  ENDMETHOD.


  METHOD read_style.
    DATA ls_adm    TYPE stxsadm.
    DATA ls_header TYPE ssfcats.
    DATA lt_para   TYPE STANDARD TABLE OF ssfparas.
    DATA lt_str    TYPE STANDARD TABLE OF ssfstrings.
    DATA lt_tab    TYPE STANDARD TABLE OF stxstab.
    DATA lo_part   TYPE REF TO if_ixml_element.

    CLEAR: ev_xml, ev_message.
    SELECT SINGLE * FROM stxsadm INTO @ls_adm WHERE stylename = @iv_name.
    IF sy-subrc <> 0.
      ev_message = |Style { iv_name } does not exist|.
      RETURN.
    ENDIF.
    DATA(lv_langu) = CONV sylangu( comp( is_data = ls_adm iv_name = `MASTERLANG` ) ).
    IF lv_langu IS INITIAL.
      lv_langu = sy-langu.
    ENDIF.

    " active version first, inactive as fallback (like the Style Builder)
    DATA(lv_rc) = 1.
    DATA(lt_flags) = VALUE string_table( ( `A` ) ( `I` ) ( `` ) ).
    LOOP AT lt_flags INTO DATA(lv_flag).
      CLEAR: ls_header, lt_para, lt_str, lt_tab.
      CALL FUNCTION 'SSF_READ_STYLE'
        EXPORTING
          i_style_name             = iv_name
          i_style_active_flag      = CONV tdactivate( lv_flag )
          i_style_variant          = space
          i_style_language         = lv_langu
        IMPORTING
          e_header                 = ls_header
        TABLES
          e_paragraphs             = lt_para
          e_strings                = lt_str
          e_tabstops               = lt_tab
        EXCEPTIONS
          no_name                  = 1
          no_style                 = 2
          active_style_not_found   = 3
          inactive_style_not_found = 4
          no_variant               = 5
          error_message            = 6
          OTHERS                   = 7.
      lv_rc = sy-subrc.
      IF lv_rc = 0.
        EXIT.
      ENDIF.
    ENDLOOP.
    IF lv_rc <> 0.
      ev_message = |Style { iv_name }: SSF_READ_STYLE returned { lv_rc } { sy_message( ) }|.
      RETURN.
    ENDIF.

    DATA(lo_doc)  = ixml( )->create_document( ).
    DATA(lo_root) = lo_doc->create_simple_element( name = 'SMARTSTYLE' parent = lo_doc ).
    lo_root->set_namespace_prefix( prefix = 'sf' ).
    add_root_attributes( io_root = lo_root iv_ns = c_ns_style iv_langu = lv_langu ).

    " element order of XML_DOWNLOAD_STYLE: HEADER, PARAGRAPHS, STRINGS, TABSTOPS
    DO 4 TIMES.
      CLEAR lo_part.
      CASE sy-index.
        WHEN 1.
          CALL FUNCTION 'SDIXML_DATA_TO_DOM'
            EXPORTING  name = `HEADER`     dataobject = ls_header
            IMPORTING  data_as_dom = lo_part
            CHANGING   document = lo_doc
            EXCEPTIONS OTHERS = 1.
        WHEN 2.
          CALL FUNCTION 'SDIXML_DATA_TO_DOM'
            EXPORTING  name = `PARAGRAPHS` dataobject = lt_para
            IMPORTING  data_as_dom = lo_part
            CHANGING   document = lo_doc
            EXCEPTIONS OTHERS = 1.
        WHEN 3.
          CALL FUNCTION 'SDIXML_DATA_TO_DOM'
            EXPORTING  name = `STRINGS`    dataobject = lt_str
            IMPORTING  data_as_dom = lo_part
            CHANGING   document = lo_doc
            EXCEPTIONS OTHERS = 1.
        WHEN 4.
          CALL FUNCTION 'SDIXML_DATA_TO_DOM'
            EXPORTING  name = `TABSTOPS`   dataobject = lt_tab
            IMPORTING  data_as_dom = lo_part
            CHANGING   document = lo_doc
            EXCEPTIONS OTHERS = 1.
      ENDCASE.
      IF sy-subrc <> 0 OR lo_part IS NOT BOUND.
        ev_message = |Style { iv_name }: SDIXML_DATA_TO_DOM failed (part { sy-index })|.
        RETURN.
      ENDIF.
      lo_part->set_namespace_prefix( prefix = 'sf' ).
      lo_root->append_child( new_child = lo_part ).
    ENDDO.

    ev_xml = dom_to_xstring( lo_doc ).
  ENDMETHOD.


  METHOD save_form.
    DATA lo_doc   TYPE REF TO if_ixml_document.
    DATA lo_form  TYPE REF TO cl_ssf_fb_smart_form.
    DATA lo_res   TYPE REF TO cl_ssf_fb_smart_form.
    DATA ls_adm   TYPE stxfadm.
    DATA lv_msg   TYPE string.

    " ---- 1. parse and validate the XML
    parse( EXPORTING iv_xml = iv_xml IMPORTING eo_doc = lo_doc ev_message = lv_msg ).
    IF lo_doc IS NOT BOUND.
      rs_result-message = lv_msg.
      RETURN.
    ENDIF.
    DATA(lo_root) = lo_doc->get_root_element( ).
    IF lo_root IS NOT BOUND OR lo_root->get_name( ) <> `SMARTFORM`.
      rs_result-message = `The XML is not a Smart Form (root element SMARTFORM expected)`.
      RETURN.
    ENDIF.
    DATA(lo_header)   = child( io_parent = lo_root iv_name = `HEADER` ).
    DATA(lv_xmlname)  = to_upper( child_value( io_parent = lo_header iv_name = `FORMNAME` ) ).
    DATA(lv_formtype) = child_value( io_parent = lo_header iv_name = `FORMTYPE` ).
    DATA(lv_textlang) = xml_language( io_root = lo_root iv_ns = c_ns_form ).
    DATA(lv_master)   = CONV sylangu( child_value( io_parent = lo_header iv_name = `MASTERLANG` ) ).
    IF lv_xmlname IS NOT INITIAL AND lv_xmlname <> iv_name.
      rs_result-message = |The XML contains form { lv_xmlname }, not { iv_name }|.
      RETURN.
    ENDIF.
    IF lv_master IS INITIAL.
      lv_master = COND #( WHEN lv_textlang IS NOT INITIAL THEN lv_textlang ELSE sy-langu ).
    ENDIF.
    IF lv_textlang IS INITIAL.
      lv_textlang = lv_master.
    ENDIF.
    DATA(lv_is_text) = xsdbool( lv_formtype = 'T' ).

    SELECT SINGLE * FROM stxfadm INTO @ls_adm WHERE formname = @iv_name.
    DATA(lv_new) = xsdbool( sy-subrc <> 0 ).
    DATA(lv_devclass) = COND devclass( WHEN lv_new = abap_false THEN ls_adm-devclass
                                       WHEN iv_devclass IS NOT INITIAL THEN iv_devclass
                                       ELSE '$TMP' ).

    " ---- 2. lock (no correction dialog here, the request is assigned below)
    TRY.
        CREATE OBJECT lo_form.
        lo_form->enqueue( EXPORTING suppress_corr_check   = 'X'
                                    language_upd_exit     = space
                                    master_language       = lv_master
                                    mode                  = COND #( WHEN lv_new = abap_true THEN `INSERT` ELSE `MODIFY` )
                                    formname              = iv_name
                          IMPORTING new_master_language   = DATA(lv_new_master) ).
        IF lv_new_master IS NOT INITIAL AND lv_new = abap_true.
          lv_master = lv_new_master.
        ENDIF.
      CATCH cx_ssf_fb INTO DATA(lx_lock).
        rs_result-message = |{ iv_name } cannot be locked: { lx_lock->get_text( ) }|.
        RETURN.
    ENDTRY.

    " ---- 3. transport request / package without popup
    IF corr_insert( EXPORTING iv_object     = iv_name
                              iv_class      = 'SSFO'
                              iv_new        = lv_new
                              iv_masterlang = lv_master
                              iv_transport  = iv_transport
                    CHANGING  cv_devclass   = lv_devclass
                              cs_result     = rs_result ) = abap_false.
      TRY.
          lo_form->dequeue( formname = iv_name ).
        CATCH cx_ssf_fb ##NO_HANDLER.
      ENDTRY.
      RETURN.
    ENDIF.

    TRY.
        " ---- 4. build the form object from the XML (as FB_UPLOAD_FORM / SMARTFORMS -> Utilities -> Upload):
        "         DOM = root element <SMARTFORM>, the method creates the new form object in SFORM
        CLEAR lo_res.
        lo_form->xml_upload( EXPORTING dom      = lo_root
                                       formname = iv_name
                                       language = lv_textlang
                             CHANGING  sform    = lo_res ).
        IF lo_res IS NOT BOUND.
          rs_result-message = |{ iv_name } not saved: the XML could not be converted into a form|.
          TRY.
              lo_form->dequeue( formname = iv_name ).
            CATCH cx_ssf_fb ##NO_HANDLER.
          ENDTRY.
          RETURN.
        ENDIF.
        lo_res->header-formname   = iv_name.
        lo_res->header-masterlang = lv_master.
        lo_res->header-devclass   = lv_devclass.

        " ---- 5. check (only when activating; text modules are always active)
        DATA(lv_active) = COND tdsfflag( WHEN lv_is_text = abap_true OR iv_activate = abap_true THEN 'X' ELSE space ).
        IF iv_activate = abap_true AND lv_is_text = abap_false.
          TRY.
              lo_res->check( global_check_flag = 'X' ).
            CATCH cx_ssf_fb_check INTO DATA(lx_check).
              " the exception only says "error occurred during check"; the single
              " messages are kept in error tables of the exception / form objects
              check_messages( EXPORTING ix_check  = lx_check
                                        io_form   = lo_res
                              IMPORTING et_text   = DATA(lt_check)
                                        ev_errors = DATA(lv_errors) ).
              APPEND LINES OF lt_check TO rs_result-messages.
              IF lv_errors = abap_true.
                lv_active = space.        " errors: save inactive, report them
              ENDIF.                      " only warnings: activate like SMARTFORMS does
          ENDTRY.
        ENDIF.

        " ---- 6. save
        lo_res->store( im_formname = iv_name
                        im_language = lv_textlang
                        im_active   = lv_active ).
        rs_result-active = xsdbool( lv_active = 'X' ).

      CATCH cx_root INTO DATA(lx_save).
        rs_result-message = |{ iv_name } not saved: { error_text( lx_save ) }|.
        ROLLBACK WORK.                                  "#EC CI_ROLLBACK
        TRY.
            lo_form->dequeue( formname = iv_name ).
          CATCH cx_ssf_fb ##NO_HANDLER.
        ENDTRY.
        RETURN.
    ENDTRY.

    TRY.
        lo_form->dequeue( formname = iv_name ).
      CATCH cx_ssf_fb ##NO_HANDLER.
    ENDTRY.
    COMMIT WORK AND WAIT.

    " ---- 7. generate the function module
    IF rs_result-active = abap_true AND lv_is_text = abap_false.
      CALL FUNCTION 'FB_GENERATE_FORM'
        EXPORTING
          i_formname       = iv_name
        EXCEPTIONS
          no_name          = 1
          no_form          = 2
          no_active_source = 3
          generation_error = 4
          illegal_formtype = 5
          error_message    = 6
          OTHERS           = 7.
      IF sy-subrc <> 0.
        APPEND |Generation: { sy_message( ) }| TO rs_result-messages.
      ELSE.
        COMMIT WORK AND WAIT.
        DATA(ls_fm) = function_module_name( iv_name ).
        rs_result-fm_name = ls_fm-fm_name.
      ENDIF.
    ENDIF.

    rs_result-ok       = abap_true.
    rs_result-devclass = lv_devclass.
    rs_result-message  = COND #(
      WHEN lv_is_text = abap_true            THEN |Text module { iv_name } saved|
      WHEN rs_result-active = abap_true      THEN |Form { iv_name } saved and activated{ COND #( WHEN rs_result-fm_name IS NOT INITIAL THEN | ({ rs_result-fm_name })| ) }|
      WHEN iv_activate = abap_true           THEN |Form { iv_name } saved inactive: the check found errors|
      ELSE                                        |Form { iv_name } saved (inactive)| ).
  ENDMETHOD.


  METHOD delete_form.
    DATA ls_adm TYPE stxfadm.

    SELECT SINGLE * FROM stxfadm INTO @ls_adm WHERE formname = @iv_name.
    IF sy-subrc <> 0.
      rs_result-message = |Form { iv_name } does not exist|.
      RETURN.
    ENDIF.
    DATA(lv_devclass) = ls_adm-devclass.
    DATA(lv_master)   = CONV sylangu( comp( is_data = ls_adm iv_name = `MASTERLANG` ) ).
    IF lv_master IS INITIAL.
      lv_master = sy-langu.
    ENDIF.

    " transportable: register the object in the request first, so no dialog comes up
    IF lv_devclass IS NOT INITIAL AND lv_devclass(1) <> '$'.
      IF corr_insert( EXPORTING iv_object     = iv_name
                                iv_class      = 'SSFO'
                                iv_new        = abap_false
                                iv_masterlang = lv_master
                                iv_transport  = iv_transport
                      CHANGING  cv_devclass   = lv_devclass
                                cs_result     = rs_result ) = abap_false.
        RETURN.
      ENDIF.
    ENDIF.

    TRY.
        CALL FUNCTION 'FB_DELETE_FORM'
          EXPORTING
            i_formname            = iv_name
            i_with_dialog         = space
            i_with_confirm_dialog = space
          EXCEPTIONS
            error_message         = 1
            OTHERS                = 2.
        DATA(lv_subrc) = sy-subrc.
      CATCH cx_sy_dyn_call_error INTO DATA(lx_call).
        rs_result-message = |{ iv_name } not deleted: FB_DELETE_FORM { error_text( lx_call ) }|.
        RETURN.
    ENDTRY.

    SELECT SINGLE formname FROM stxfadm INTO @DATA(lv_still) WHERE formname = @iv_name.
    IF sy-subrc = 0.
      rs_result-message = |{ iv_name } not deleted: { COND #( WHEN lv_subrc <> 0 THEN sy_message( ) ELSE `the form still exists` ) }|.
      RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    rs_result-ok       = abap_true.
    rs_result-devclass = lv_devclass.
    rs_result-message  = |{ COND #( WHEN comp( is_data = ls_adm iv_name = `FORMTYPE` ) = `T` THEN `Text module` ELSE `Form` ) } { iv_name } deleted|.
  ENDMETHOD.


  METHOD delete_style.
    DATA ls_adm TYPE stxsadm.

    SELECT SINGLE * FROM stxsadm INTO @ls_adm WHERE stylename = @iv_name.
    IF sy-subrc <> 0.
      rs_result-message = |Style { iv_name } does not exist|.
      RETURN.
    ENDIF.
    DATA(lv_devclass) = CONV devclass( comp( is_data = ls_adm iv_name = `DEVCLASS` ) ).
    DATA(lv_master)   = CONV sylangu( comp( is_data = ls_adm iv_name = `MASTERLANG` ) ).
    IF lv_master IS INITIAL.
      lv_master = sy-langu.
    ENDIF.

    IF lv_devclass IS NOT INITIAL AND lv_devclass(1) <> '$'.
      IF corr_insert( EXPORTING iv_object     = iv_name
                                iv_class      = 'SSST'
                                iv_new        = abap_false
                                iv_masterlang = lv_master
                                iv_transport  = iv_transport
                      CHANGING  cv_devclass   = lv_devclass
                                cs_result     = rs_result ) = abap_false.
        RETURN.
      ENDIF.
    ENDIF.

    TRY.
        CALL FUNCTION 'SSF_DELETE_STYLE'
          EXPORTING
            i_stylename           = iv_name
            i_with_dialog         = space
            i_with_confirm_dialog = space
          EXCEPTIONS
            error_message         = 1
            OTHERS                = 2.
        DATA(lv_subrc) = sy-subrc.
      CATCH cx_sy_dyn_call_error INTO DATA(lx_call).
        rs_result-message = |{ iv_name } not deleted: SSF_DELETE_STYLE { error_text( lx_call ) }|.
        RETURN.
    ENDTRY.

    SELECT SINGLE stylename FROM stxsadm INTO @DATA(lv_still) WHERE stylename = @iv_name.
    IF sy-subrc = 0.
      rs_result-message = |{ iv_name } not deleted: { COND #( WHEN lv_subrc <> 0 THEN sy_message( ) ELSE `the style still exists` ) }|.
      RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    rs_result-ok       = abap_true.
    rs_result-devclass = lv_devclass.
    rs_result-message  = |Style { iv_name } deleted|.
  ENDMETHOD.


  METHOD save_style.
    DATA lo_doc    TYPE REF TO if_ixml_document.
    DATA lv_msg    TYPE string.
    DATA ls_header TYPE ssfcats.
    DATA ls_saved  TYPE ssfcats.
    DATA lt_para   TYPE STANDARD TABLE OF ssfparas.
    DATA lt_str    TYPE STANDARD TABLE OF ssfstrings.
    DATA lt_tab    TYPE STANDARD TABLE OF stxstab.
    DATA lt_err    TYPE STANDARD TABLE OF tline.
    DATA ls_adm    TYPE stxsadm.
    DATA lv_status TYPE tdactivate.
    DATA lo_elem   TYPE REF TO if_ixml_element.

    parse( EXPORTING iv_xml = iv_xml IMPORTING eo_doc = lo_doc ev_message = lv_msg ).
    IF lo_doc IS NOT BOUND.
      rs_result-message = lv_msg.
      RETURN.
    ENDIF.
    DATA(lo_root) = lo_doc->get_root_element( ).
    IF lo_root IS NOT BOUND OR lo_root->get_name( ) <> `SMARTSTYLE`.
      rs_result-message = `The XML is not a Smart Style (root element SMARTSTYLE expected)`.
      RETURN.
    ENDIF.

    " ---- XML parts -> SSF_SAVE_STYLE tables
    DATA(lo_children) = lo_root->get_children( ).
    DATA(lo_iter) = lo_children->create_iterator( ).
    DATA(lo_node) = lo_iter->get_next( ).
    WHILE lo_node IS BOUND.
      IF lo_node->get_type( ) = if_ixml_node=>co_node_element.
        lo_elem ?= lo_node.
        CASE lo_elem->get_name( ).
          WHEN `HEADER`.
            CALL FUNCTION 'SDIXML_DOM_TO_DATA'
              EXPORTING  data_as_dom = lo_elem
              IMPORTING  dataobject  = ls_header
              EXCEPTIONS OTHERS      = 1.
          WHEN `PARAGRAPHS`.
            CALL FUNCTION 'SDIXML_DOM_TO_DATA'
              EXPORTING  data_as_dom = lo_elem
              IMPORTING  dataobject  = lt_para
              EXCEPTIONS OTHERS      = 1.
          WHEN `STRINGS`.
            CALL FUNCTION 'SDIXML_DOM_TO_DATA'
              EXPORTING  data_as_dom = lo_elem
              IMPORTING  dataobject  = lt_str
              EXCEPTIONS OTHERS      = 1.
          WHEN `TABSTOPS`.
            CALL FUNCTION 'SDIXML_DOM_TO_DATA'
              EXPORTING  data_as_dom = lo_elem
              IMPORTING  dataobject  = lt_tab
              EXCEPTIONS OTHERS      = 1.
          WHEN OTHERS.
            sy-subrc = 0.
        ENDCASE.
        IF sy-subrc <> 0.
          rs_result-message = |Style XML part { lo_elem->get_name( ) } cannot be read|.
          RETURN.
        ENDIF.
      ENDIF.
      lo_node = lo_iter->get_next( ).
    ENDWHILE.

    IF ls_header-stylename IS NOT INITIAL AND ls_header-stylename <> iv_name.
      rs_result-message = |The XML contains style { ls_header-stylename }, not { iv_name }|.
      RETURN.
    ENDIF.
    ls_header-stylename = iv_name.
    LOOP AT lt_para ASSIGNING FIELD-SYMBOL(<ls_para>).
      <ls_para>-stylename = iv_name.
    ENDLOOP.
    LOOP AT lt_str ASSIGNING FIELD-SYMBOL(<ls_str>).
      <ls_str>-stylename = iv_name.
    ENDLOOP.
    LOOP AT lt_tab ASSIGNING FIELD-SYMBOL(<ls_tab>).
      <ls_tab>-stylename = iv_name.
    ENDLOOP.

    SELECT SINGLE * FROM stxsadm INTO @ls_adm WHERE stylename = @iv_name.
    DATA(lv_new) = xsdbool( sy-subrc <> 0 ).
    DATA(lv_devclass) = COND devclass( WHEN lv_new = abap_false THEN CONV devclass( comp( is_data = ls_adm iv_name = `DEVCLASS` ) )
                                       WHEN iv_devclass IS NOT INITIAL THEN iv_devclass
                                       ELSE '$TMP' ).
    DATA(lv_master) = CONV sylangu( comp( is_data = ls_header iv_name = `MASTERLANG` ) ).
    IF lv_master IS INITIAL.
      lv_master = sy-langu.
    ENDIF.

    IF corr_insert( EXPORTING iv_object     = iv_name
                              iv_class      = 'SSST'
                              iv_new        = lv_new
                              iv_masterlang = lv_master
                              iv_transport  = iv_transport
                    CHANGING  cv_devclass   = lv_devclass
                              cs_result     = rs_result ) = abap_false.
      RETURN.
    ENDIF.
    ASSIGN COMPONENT `DEVCLASS` OF STRUCTURE ls_header TO FIELD-SYMBOL(<lv_devc>).
    IF sy-subrc = 0.
      <lv_devc> = lv_devclass.
    ENDIF.

    " ---- save (inactive), like the Style Builder
    CALL FUNCTION 'SSF_SAVE_STYLE'
      EXPORTING
        i_header       = ls_header
        i_lock_style   = 'X'
      IMPORTING
        e_header       = ls_saved
      TABLES
        i_paragraphs   = lt_para
        i_strings      = lt_str
        i_tabstops     = lt_tab
      EXCEPTIONS
        error_message  = 1
        OTHERS         = 2.
    IF sy-subrc <> 0 OR ls_saved-stylename IS INITIAL.
      rs_result-message = |Style { iv_name } not saved: { sy_message( ) }|.
      ROLLBACK WORK.                                    "#EC CI_ROLLBACK
      RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.

    " ---- activate
    IF iv_activate = abap_true.
      CALL FUNCTION 'SSF_ACTIVATE_STYLE'
        EXPORTING
          i_stylename          = iv_name
          i_with_dialog        = space
          redirect_error_msg   = 'X'
        IMPORTING
          o_status             = lv_status
        TABLES
          error_msg            = lt_err
        EXCEPTIONS
          no_name              = 1
          no_style             = 2
          cancelled            = 3
          no_access_permission = 4
          illegal_language     = 5
          error_message        = 6
          OTHERS               = 7.
      IF sy-subrc = 0.
        COMMIT WORK AND WAIT.
        rs_result-active = xsdbool( lt_err IS INITIAL ).
      ELSE.
        APPEND |Activation: { sy_message( ) }| TO rs_result-messages.
      ENDIF.
      LOOP AT lt_err INTO DATA(ls_err) WHERE tdline IS NOT INITIAL.
        APPEND CONV string( ls_err-tdline ) TO rs_result-messages.
      ENDLOOP.
    ENDIF.

    rs_result-ok       = abap_true.
    rs_result-devclass = lv_devclass.
    rs_result-message  = COND #(
      WHEN rs_result-active = abap_true THEN |Style { iv_name } saved and activated|
      WHEN iv_activate = abap_true      THEN |Style { iv_name } saved inactive: activation reported errors|
      ELSE                                   |Style { iv_name } saved (inactive)| ).
  ENDMETHOD.


  METHOD function_module_name.
    CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
      EXPORTING
        formname           = iv_name
      IMPORTING
        fm_name            = rs_result-fm_name
      EXCEPTIONS
        no_form            = 1
        no_function_module = 2
        OTHERS             = 3.
    IF sy-subrc = 0.
      rs_result-ok      = abap_true.
      rs_result-message = |{ iv_name }: { rs_result-fm_name }|.
    ELSE.
      rs_result-message = |{ iv_name }: { COND #( WHEN sy-subrc = 2 THEN `not generated yet, activate the form` ELSE sy_message( ) ) }|.
    ENDIF.
  ENDMETHOD.


  METHOD list.
    DATA lt_fadm TYPE STANDARD TABLE OF stxfadm WITH DEFAULT KEY.
    DATA lt_sadm TYPE STANDARD TABLE OF stxsadm WITH DEFAULT KEY.
    DATA lt_like TYPE string_table.

    lt_like = pattern( iv_search ).

    IF iv_type IS INITIAL OR iv_type = `SF` OR iv_type = `TM`.
      LOOP AT lt_like INTO DATA(lv_like).
        SELECT * FROM stxfadm APPENDING TABLE @lt_fadm
          UP TO @iv_max ROWS
          WHERE formname LIKE @lv_like.
      ENDLOOP.
      SORT lt_fadm BY formname.
      DELETE ADJACENT DUPLICATES FROM lt_fadm COMPARING formname.
      LOOP AT lt_fadm INTO DATA(ls_f).
        DATA(lv_kind) = COND string( WHEN comp( is_data = ls_f iv_name = `FORMTYPE` ) = `T` THEN `TM` ELSE `SF` ).
        CHECK iv_type IS INITIAL OR iv_type = lv_kind.
        APPEND VALUE #( type     = lv_kind
                        name     = condense( CONV string( ls_f-formname ) )
                        devclass = ls_f-devclass
                        lastuser = comp( is_data = ls_f iv_name = `LASTUSER` )
                        lastdate = comp( is_data = ls_f iv_name = `LASTDATE` ) ) TO rt_list.
      ENDLOOP.
      " descriptions (table STXFADMT, read dynamically: older releases name it differently)
      LOOP AT rt_list ASSIGNING FIELD-SYMBOL(<ls_obj>) WHERE type = `SF` OR type = `TM`.
        TRY.
            DATA lv_caption TYPE c LENGTH 80.
            CLEAR lv_caption.
            DATA(lv_where) = |FORMNAME = '{ <ls_obj>-name }' AND LANGU = '{ sy-langu }'|.
            SELECT SINGLE caption FROM ('STXFADMT') INTO @lv_caption WHERE (lv_where).
            IF sy-subrc <> 0.
              lv_where = |FORMNAME = '{ <ls_obj>-name }'|.
              SELECT SINGLE caption FROM ('STXFADMT') INTO @lv_caption WHERE (lv_where).
            ENDIF.
            <ls_obj>-caption = condense( CONV string( lv_caption ) ).
          CATCH cx_sy_dynamic_osql_error ##NO_HANDLER.
        ENDTRY.
      ENDLOOP.
    ENDIF.

    IF iv_type IS INITIAL OR iv_type = `SS`.
      LOOP AT lt_like INTO lv_like.
        SELECT * FROM stxsadm APPENDING TABLE @lt_sadm
          UP TO @iv_max ROWS
          WHERE stylename LIKE @lv_like.
      ENDLOOP.
      SORT lt_sadm BY stylename.
      DELETE ADJACENT DUPLICATES FROM lt_sadm COMPARING stylename.
      LOOP AT lt_sadm INTO DATA(ls_s).
        DATA lv_scap TYPE stxsadmt-caption.
        CLEAR lv_scap.
        SELECT SINGLE caption FROM stxsadmt INTO @lv_scap
          WHERE stylename = @ls_s-stylename AND langu = @sy-langu.
        IF sy-subrc <> 0.
          SELECT SINGLE caption FROM stxsadmt INTO @lv_scap
            WHERE stylename = @ls_s-stylename.
        ENDIF.
        APPEND VALUE #( type     = `SS`
                        name     = condense( CONV string( ls_s-stylename ) )
                        caption  = condense( CONV string( lv_scap ) )
                        devclass = comp( is_data = ls_s iv_name = `DEVCLASS` )
                        lastuser = comp( is_data = ls_s iv_name = `LASTUSER` )
                        lastdate = comp( is_data = ls_s iv_name = `LASTDATE` ) ) TO rt_list.
      ENDLOOP.
    ENDIF.

    IF lines( rt_list ) > iv_max.
      DATA(lv_from) = iv_max + 1.
      DELETE rt_list FROM lv_from.
    ENDIF.
  ENDMETHOD.


  METHOD parse.
    CLEAR: eo_doc, ev_message.
    IF iv_xml IS INITIAL.
      ev_message = `No XML received`.
      RETURN.
    ENDIF.
    CALL FUNCTION 'SDIXML_XML_TO_DOM'
      EXPORTING
        xml           = iv_xml
      IMPORTING
        document      = eo_doc
      EXCEPTIONS
        invalid_input = 1
        OTHERS        = 2.
    IF sy-subrc <> 0 OR eo_doc IS NOT BOUND.
      CLEAR eo_doc.
      ev_message = `The XML is not well-formed`.
    ENDIF.
  ENDMETHOD.


  METHOD child.
    DATA lo_elem TYPE REF TO if_ixml_element.
    CHECK io_parent IS BOUND.
    DATA(lo_iter) = io_parent->get_children( )->create_iterator( ).
    DATA(lo_node) = lo_iter->get_next( ).
    WHILE lo_node IS BOUND.
      IF lo_node->get_type( ) = if_ixml_node=>co_node_element.
        lo_elem ?= lo_node.
        IF lo_elem->get_name( ) = iv_name.
          ro_elem = lo_elem.
          RETURN.
        ENDIF.
      ENDIF.
      lo_node = lo_iter->get_next( ).
    ENDWHILE.
  ENDMETHOD.


  METHOD child_value.
    DATA(lo_elem) = child( io_parent = io_parent iv_name = iv_name ).
    IF lo_elem IS BOUND.
      rv_val = lo_elem->get_value( ).
    ENDIF.
  ENDMETHOD.


  METHOD xml_language.
    DATA lv_laiso TYPE laiso.
    DATA(lv_iso) = io_root->get_attribute_ns( name = 'language' uri = iv_ns ).
    IF lv_iso IS INITIAL.
      lv_iso = io_root->get_attribute( name = 'language' namespace = 'sf' ).
    ENDIF.
    CHECK lv_iso IS NOT INITIAL.
    lv_laiso = to_upper( lv_iso ).
    CALL FUNCTION 'CONVERSION_EXIT_ISOLA_INPUT'
      EXPORTING
        input            = lv_laiso
      IMPORTING
        output           = rv_lang
      EXCEPTIONS
        unknown_language = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      CLEAR rv_lang.
    ENDIF.
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


  METHOD corr_insert.
    " Registers the object in the package / transport request without any popup.
    " Local objects ($TMP) need no request. The SAP save routines call RS_CORR_INSERT
    " again afterwards and then find the object already assigned (no dialog).
    DATA lv_korr TYPE trkorr.
    DATA lv_devc TYPE devclass.

    lv_devc = cv_devclass.
    CALL FUNCTION 'RS_CORR_INSERT'
      EXPORTING
        object              = CONV char120( iv_object )
        object_class        = iv_class
        mode                = COND char1( WHEN iv_new = abap_true THEN 'I' ELSE space )
        global_lock         = 'X'
        devclass            = lv_devc
        korrnum             = iv_transport
        master_language     = iv_masterlang
        suppress_dialog     = 'X'
      IMPORTING
        devclass            = lv_devc
        korrnum             = lv_korr
      EXCEPTIONS
        cancelled           = 1
        permission_failure  = 2
        unknown_objectclass = 3
        error_message       = 4
        OTHERS              = 5.
    IF sy-subrc <> 0.
      DATA(lv_text) = sy_message( ).
      cs_result-message = COND #(
        WHEN iv_transport IS INITIAL AND lv_devc(1) <> '$'
          THEN |{ iv_object } is in transportable package { lv_devc }: enter a transport request in Settings → SAP Connection. ({ lv_text })|
        ELSE |Transport request / package for { iv_object }: { lv_text }| ).
      RETURN.
    ENDIF.
    IF lv_devc IS NOT INITIAL.
      cv_devclass = lv_devc.
    ENDIF.
    cs_result-korrnum = lv_korr.
    rv_ok = abap_true.
  ENDMETHOD.


  METHOD check_messages.
    DATA lt_diag TYPE string_table.

    CLEAR: et_text, ev_errors.
    " exception chain: own tables + texts of PREVIOUS exceptions
    DATA(lx) = ix_check.
    WHILE lx IS BOUND.
      collect_tables( EXPORTING io_object = lx
                                iv_owner  = cl_abap_classdescr=>get_class_name( lx )
                      CHANGING  ct_text   = et_text
                                ct_diag   = lt_diag
                                cv_errors = ev_errors ).
      IF lx <> ix_check.
        APPEND |E: { lx->get_text( ) }| TO et_text.
        ev_errors = abap_true.
      ENDIF.
      lx = lx->previous.
    ENDWHILE.

    " error tables of the form object (instance and static attributes)
    IF io_form IS BOUND.
      collect_tables( EXPORTING io_object = io_form
                                iv_owner  = cl_abap_classdescr=>get_class_name( io_form )
                      CHANGING  ct_text   = et_text
                                ct_diag   = lt_diag
                                cv_errors = ev_errors ).
    ENDIF.

    DELETE et_text WHERE table_line IS INITIAL.
    IF et_text IS INITIAL.
      " nothing readable found: report the exception and where messages could be
      ev_errors = abap_true.
      APPEND |E: { ix_check->get_text( ) }| TO et_text.
      LOOP AT lt_diag INTO DATA(lv_diag).
        APPEND |E: { lv_diag }| TO et_text.
      ENDLOOP.
    ENDIF.
  ENDMETHOD.


  METHOD collect_tables.
    FIELD-SYMBOLS <lt_tab> TYPE ANY TABLE.
    FIELD-SYMBOLS <lv_any> TYPE any.

    DATA(lo_descr) = CAST cl_abap_classdescr( cl_abap_typedescr=>describe_by_object_ref( io_object ) ).
    DATA(lv_class) = lo_descr->get_relative_name( ).

    LOOP AT lo_descr->attributes INTO DATA(ls_attr)
         WHERE visibility = cl_abap_objectdescr=>public
           AND type_kind  = cl_abap_typedescr=>typekind_table.
      UNASSIGN <lv_any>.
      IF ls_attr-is_class = abap_true.
        DATA(lv_static) = |{ lv_class }=>{ ls_attr-name }|.
        ASSIGN (lv_static) TO <lv_any>.
      ELSE.
        ASSIGN io_object->(ls_attr-name) TO <lv_any>.
      ENDIF.
      IF <lv_any> IS NOT ASSIGNED.
        CONTINUE.
      ENDIF.
      ASSIGN <lv_any> TO <lt_tab>.
      IF <lt_tab> IS INITIAL.
        CONTINUE.
      ENDIF.
      APPEND |{ iv_owner }-{ ls_attr-name }: { lines( <lt_tab> ) } row(s)| TO ct_diag.

      " only tables that look like error / message lists
      IF NOT ( ls_attr-name CS 'ERR' OR ls_attr-name CS 'MSG' OR ls_attr-name CS 'MESS'
            OR ls_attr-name CS 'CHECK' OR ls_attr-name CS 'LOG' OR ls_attr-name CS 'PROT' ).
        CONTINUE.
      ENDIF.
      LOOP AT <lt_tab> ASSIGNING FIELD-SYMBOL(<ls_row>).
        row_text( EXPORTING is_row      = <ls_row>
                  IMPORTING ev_text     = DATA(lv_text)
                            ev_severity = DATA(lv_sev) ).
        IF lv_text IS INITIAL.
          CONTINUE.
        ENDIF.
        IF lv_sev IS INITIAL OR lv_sev CA 'EAX'.
          lv_sev = 'E'.
          cv_errors = abap_true.
        ENDIF.
        DATA(lv_line) = |{ lv_sev }: { lv_text }|.
        READ TABLE ct_text WITH KEY table_line = lv_line TRANSPORTING NO FIELDS.
        IF sy-subrc <> 0.
          APPEND lv_line TO ct_text.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.


  METHOD row_text.
    " error list row -> "NODE: message" + severity. The row is flattened first (nested
    " structures, node objects), then T100 / text / node / severity fields are picked by name.
    DATA lt_pairs TYPE ty_pairs.
    DATA lv_msgid TYPE symsgid.
    DATA lv_msgno TYPE symsgno.
    DATA lv_v1    TYPE symsgv.
    DATA lv_v2    TYPE symsgv.
    DATA lv_v3    TYPE symsgv.
    DATA lv_v4    TYPE symsgv.
    DATA lv_node  TYPE string.
    DATA lv_text  TYPE string.
    DATA lv_rest  TYPE string.

    CLEAR: ev_text, ev_severity.
    flatten( EXPORTING is_data = is_row iv_path = `` iv_depth = 0 CHANGING ct_pairs = lt_pairs ).

    LOOP AT lt_pairs INTO DATA(ls_pair) WHERE value IS NOT INITIAL.
      " leaf name = last part of the path
      DATA(lv_leaf) = ls_pair-name.
      FIND ALL OCCURRENCES OF `-` IN lv_leaf MATCH OFFSET DATA(lv_off).
      IF sy-subrc = 0.
        lv_leaf = substring( val = lv_leaf off = lv_off + 1 ).
      ENDIF.
      CASE lv_leaf.
        WHEN 'MSGID' OR 'ARBGB' OR 'ID'.
          lv_msgid = ls_pair-value.
        WHEN 'MSGNO' OR 'MSGNR' OR 'NUMBER'.
          lv_msgno = ls_pair-value.
        WHEN 'MSGV1' OR 'MESSAGE_V1'.
          lv_v1 = ls_pair-value.
        WHEN 'MSGV2' OR 'MESSAGE_V2'.
          lv_v2 = ls_pair-value.
        WHEN 'MSGV3' OR 'MESSAGE_V3'.
          lv_v3 = ls_pair-value.
        WHEN 'MSGV4' OR 'MESSAGE_V4'.
          lv_v4 = ls_pair-value.
        WHEN 'MSGTY' OR 'MSGTYP' OR 'MSGTYPE' OR 'TYPE' OR 'SEVERITY' OR 'ERRTYPE' OR 'ERRTYP' OR 'ERRORTYPE' OR 'ERROR_TYPE' OR 'KIND' OR 'CLASS'.
          IF ev_severity IS INITIAL AND strlen( ls_pair-value ) = 1 AND ls_pair-value CA 'EWIASX'.
            ev_severity = ls_pair-value.
          ELSE.
            lv_rest = |{ lv_rest }{ COND #( WHEN lv_rest IS NOT INITIAL THEN `, ` ) }{ ls_pair-name }={ ls_pair-value }|.
          ENDIF.
        WHEN 'INAME' OR 'NODENAME' OR 'NODE'.
          IF lv_node IS INITIAL.
            lv_node = ls_pair-value.
          ENDIF.
        WHEN 'TEXT' OR 'MESSAGE' OR 'MSGTEXT' OR 'MSG' OR 'LINE' OR 'TDLINE' OR 'ERRTEXT' OR 'ERROR_TEXT'.
          IF lv_text IS INITIAL.
            lv_text = ls_pair-value.
          ENDIF.
        WHEN OTHERS.
          lv_rest = |{ lv_rest }{ COND #( WHEN lv_rest IS NOT INITIAL THEN `, ` ) }{ ls_pair-name }={ ls_pair-value }|.
      ENDCASE.
    ENDLOOP.

    IF lv_msgid IS NOT INITIAL.
      MESSAGE ID lv_msgid TYPE 'S' NUMBER lv_msgno
              WITH lv_v1 lv_v2 lv_v3 lv_v4 INTO ev_text.
    ENDIF.
    IF ev_text IS INITIAL.
      ev_text = lv_text.
    ENDIF.
    IF ev_text IS INITIAL.
      " unknown row layout: show all fields with their names
      ev_text = lv_rest.
    ENDIF.
    IF lv_node IS NOT INITIAL AND ev_text IS NOT INITIAL.
      ev_text = |{ lv_node }: { ev_text }|.
    ENDIF.
  ENDMETHOD.


  METHOD flatten.
    " any value -> list of PATH=VALUE for elementary components; follows nested structures
    " and object references (name-like public attributes only), max. 3 levels
    FIELD-SYMBOLS <lv_comp> TYPE any.
    DATA lo_obj   TYPE REF TO object.
    DATA lt_names TYPE string_table.

    IF iv_depth > 3.
      RETURN.
    ENDIF.
    DATA(lo_type) = cl_abap_typedescr=>describe_by_data( is_data ).
    CASE lo_type->kind.
      WHEN cl_abap_typedescr=>kind_elem.
        APPEND VALUE #( name = iv_path value = condense( |{ is_data }| ) ) TO ct_pairs.

      WHEN cl_abap_typedescr=>kind_struct.
        " COMPONENTS lists the fields with .INCLUDEs already resolved
        DATA(lo_struct) = CAST cl_abap_structdescr( lo_type ).
        LOOP AT lo_struct->components INTO DATA(ls_comp).
          ASSIGN COMPONENT ls_comp-name OF STRUCTURE is_data TO <lv_comp>.
          IF sy-subrc = 0.
            flatten( EXPORTING is_data  = <lv_comp>
                               iv_path  = COND #( WHEN iv_path IS INITIAL THEN CONV string( ls_comp-name ) ELSE |{ iv_path }-{ ls_comp-name }| )
                               iv_depth = iv_depth + 1
                     CHANGING  ct_pairs = ct_pairs ).
          ENDIF.
        ENDLOOP.

      WHEN cl_abap_typedescr=>kind_ref.
        DATA(lv_refkind) = CAST cl_abap_refdescr( lo_type )->get_referenced_type( )->kind.
        IF lv_refkind <> cl_abap_typedescr=>kind_class AND lv_refkind <> cl_abap_typedescr=>kind_intf.
          " data reference: follow it
          DATA lr_data TYPE REF TO data.
          TRY.
              lr_data ?= is_data.
            CATCH cx_sy_move_cast_error.
              RETURN.
          ENDTRY.
          IF lr_data IS BOUND.
            ASSIGN lr_data->* TO FIELD-SYMBOL(<lv_deref>).
            IF sy-subrc = 0.
              flatten( EXPORTING is_data = <lv_deref> iv_path = iv_path iv_depth = iv_depth + 1 CHANGING ct_pairs = ct_pairs ).
            ENDIF.
          ENDIF.
          RETURN.
        ENDIF.
        " MOVE, not ASSIGN: a typed ASSIGN of REF TO <class> to REF TO object is a type conflict (dump)
        TRY.
            lo_obj ?= is_data.
          CATCH cx_sy_move_cast_error.
            RETURN.
        ENDTRY.
        IF lo_obj IS NOT BOUND.
          RETURN.
        ENDIF.
        TRY.
            DATA(lx) = CAST cx_root( lo_obj ).
            APPEND VALUE #( name = COND #( WHEN iv_path IS INITIAL THEN `TEXT` ELSE |{ iv_path }-TEXT| ) value = lx->get_text( ) ) TO ct_pairs.
            RETURN.
          CATCH cx_sy_move_cast_error ##NO_HANDLER.
        ENDTRY.
        " node objects: name / type attributes tell which node the message belongs to
        lt_names = VALUE #( ( `INAME` ) ( `NAME` ) ( `NODENAME` ) ( `NODETYPE` ) ( `OBJTYPE` ) ).
        DATA(lo_cls) = CAST cl_abap_classdescr( cl_abap_typedescr=>describe_by_object_ref( lo_obj ) ).
        LOOP AT lt_names INTO DATA(lv_name).
          READ TABLE lo_cls->attributes WITH KEY name = lv_name INTO DATA(ls_attr).
          IF sy-subrc <> 0.
            CONTINUE.
          ENDIF.
          IF ls_attr-visibility <> cl_abap_objectdescr=>public OR ls_attr-is_class = abap_true.
            CONTINUE.
          ENDIF.
          ASSIGN lo_obj->(lv_name) TO <lv_comp>.
          IF sy-subrc = 0.
            flatten( EXPORTING is_data  = <lv_comp>
                               iv_path  = COND #( WHEN iv_path IS INITIAL THEN lv_name ELSE |{ iv_path }-{ lv_name }| )
                               iv_depth = iv_depth + 1
                     CHANGING  ct_pairs = ct_pairs ).
          ENDIF.
        ENDLOOP.

      WHEN cl_abap_typedescr=>kind_table.
        " e.g. message texts / parameters kept as a table inside the error row
        FIELD-SYMBOLS <lt_any> TYPE ANY TABLE.
        ASSIGN is_data TO <lt_any>.
        DATA(lv_row) = 0.
        LOOP AT <lt_any> ASSIGNING FIELD-SYMBOL(<ls_line>).
          lv_row = lv_row + 1.
          IF lv_row > 10.
            EXIT.
          ENDIF.
          flatten( EXPORTING is_data  = <ls_line>
                             iv_path  = |{ iv_path }[{ lv_row }]|
                             iv_depth = iv_depth + 1
                   CHANGING  ct_pairs = ct_pairs ).
        ENDLOOP.

      WHEN OTHERS.
        RETURN.
    ENDCASE.
  ENDMETHOD.


  METHOD error_text.
    " message text plus where it was raised, e.g. "… [CL_SSF_FB_SMART_FORM=======CM00K line 57]"
    DATA lv_program TYPE syrepid.
    DATA lv_include TYPE syrepid.
    DATA lv_line    TYPE i.
    rv_text = ix_error->get_text( ).
    IF rv_text IS INITIAL.
      rv_text = cl_abap_classdescr=>get_class_name( ix_error ).
    ENDIF.
    ix_error->get_source_position( IMPORTING program_name = lv_program
                                             include_name = lv_include
                                             source_line  = lv_line ).
    IF lv_include IS NOT INITIAL.
      rv_text = |{ rv_text } [{ lv_include } line { lv_line }]|.
    ENDIF.
  ENDMETHOD.


  METHOD sy_message.
    IF sy-msgid IS INITIAL.
      rv_text = |rc { sy-subrc }|.
      RETURN.
    ENDIF.
    MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO rv_text.
  ENDMETHOD.


  METHOD comp.
    ASSIGN COMPONENT iv_name OF STRUCTURE is_data TO FIELD-SYMBOL(<lv_val>).
    IF sy-subrc = 0.
      rv_val = condense( |{ <lv_val> }| ).
    ENDIF.
  ENDMETHOD.


  METHOD pattern.
    DATA(lv_search) = to_upper( condense( iv_search ) ).
    IF lv_search IS INITIAL.
      rt_like = VALUE #( ( `Z%` ) ( `Y%` ) ).
      RETURN.
    ENDIF.
    REPLACE ALL OCCURRENCES OF `*` IN lv_search WITH `%`.
    REPLACE ALL OCCURRENCES OF `+` IN lv_search WITH `_`.
    IF lv_search NA '%_'.
      lv_search = lv_search && `%`.
    ENDIF.
    rt_like = VALUE #( ( lv_search ) ).
  ENDMETHOD.

ENDCLASS.
