*&---------------------------------------------------------------------*
*& Report ZKE80_EDOPRE
*& Clon de KE80 (EC-PCA, informe Z8-PCA001G / grupo EDOPRE):
*& Plan / Real / Desviación por grupo de CeBe y grupo de cuentas,
*& con ALV y exportación a CSV.
*& Sintaxis compatible con ABAP 7.0 (sin plantillas de texto).
*&---------------------------------------------------------------------*
REPORT zke80_edopre.

TYPES: BEGIN OF ty_out,
         rprctr TYPE glpct-rprctr,
         ptxt   TYPE cepct-ltext,
         racct  TYPE glpct-racct,
         txt20  TYPE skat-txt20,
         plan   TYPE p LENGTH 15 DECIMALS 2,
         real   TYPE p LENGTH 15 DECIMALS 2,
         desv   TYPE p LENGTH 15 DECIMALS 2,
         desvp  TYPE p LENGTH 9  DECIMALS 2,
       END OF ty_out.

TYPES: BEGIN OF ty_rng,
         sign   TYPE c LENGTH 1,
         option TYPE c LENGTH 2,
         low    TYPE c LENGTH 24,
         high   TYPE c LENGTH 24,
       END OF ty_rng,
       ty_rng_t TYPE STANDARD TABLE OF ty_rng WITH DEFAULT KEY,
       ty_str_t TYPE STANDARD TABLE OF string WITH DEFAULT KEY.

TYPES: BEGIN OF ty_todo,
         setclass TYPE setleaf-setclass,
         subclass TYPE setleaf-subclass,
         setname  TYPE setleaf-setname,
       END OF ty_todo.

DATA: gt_out   TYPE STANDARD TABLE OF ty_out,
      gt_glpct TYPE STANDARD TABLE OF glpct,
      gr_pc    TYPE RANGE OF glpct-rprctr,
      gr_acct  TYPE RANGE OF glpct-racct.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-001.
PARAMETERS: p_perf  TYPE n LENGTH 3 DEFAULT '009' OBLIGATORY,   "De período
            p_pert  TYPE n LENGTH 3 DEFAULT '009' OBLIGATORY,   "A período
            p_ryear TYPE glpct-ryear DEFAULT sy-datum(4) OBLIGATORY, "Ejercicio
            p_rvers TYPE c LENGTH 3 DEFAULT '0' OBLIGATORY,     "Versión plan
            p_bukrs TYPE glpct-rbukrs DEFAULT 'KF01' OBLIGATORY, "Sociedad
            p_rldnr TYPE glpct-rldnr DEFAULT '8A' OBLIGATORY,   "Ledger EC-PCA
            p_kokrs TYPE tka01-kokrs OBLIGATORY,                "Área de CeBe
            p_ktopl TYPE ska1-ktopl  OBLIGATORY.                "Plan de cuentas
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-002.
PARAMETERS: p_pcgrp TYPE c LENGTH 24 DEFAULT 'VAQUERO' OBLIGATORY, "Grupo de CeBe
            p_acgrp TYPE c LENGTH 24 DEFAULT 'EDOPRE'  OBLIGATORY, "Gpo.ctas.resultados
            p_bypc  AS CHECKBOX.                                   "Desglosar por CeBe
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE text-003.
PARAMETERS: p_alv  AS CHECKBOX DEFAULT 'X',
            p_file TYPE string LOWER CASE,     "CSV en PC (primer plano)
            p_srv  TYPE string LOWER CASE.     "CSV en servidor (fondo)
SELECTION-SCREEN END OF BLOCK b3.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.
  DATA: lv_name TYPE string, lv_path TYPE string, lv_full TYPE string.
  CALL METHOD cl_gui_frontend_services=>file_save_dialog
    EXPORTING
      default_extension = 'csv'
      default_file_name = 'ke80_edopre.csv'
    CHANGING
      filename          = lv_name
      path              = lv_path
      fullpath          = lv_full.
  IF lv_full IS NOT INITIAL.
    p_file = lv_full.
  ENDIF.

START-OF-SELECTION.
  PERFORM get_sets.
  PERFORM get_data.
  PERFORM build_output.
  IF gt_out IS INITIAL.
    MESSAGE 'Sin datos para la selección' TYPE 'S'.
    RETURN.
  ENDIF.
  IF p_file IS NOT INITIAL.
    PERFORM export_csv_pc.
  ENDIF.
  IF p_srv IS NOT INITIAL.
    PERFORM export_csv_server.
  ENDIF.
  IF p_alv = 'X'.
    PERFORM show_alv.
  ENDIF.

*&---------------------------------------------------------------------*
*& Conversión ALPHA (ceros a la izquierda) sobre un campo char
*&---------------------------------------------------------------------*
FORM alpha_in CHANGING cv_val TYPE c.
  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING
      input  = cv_val
    IMPORTING
      output = cv_val.
ENDFORM.

*&---------------------------------------------------------------------*
*& Expande los grupos (GS03): CeBe clase 0106, cuentas clase 0H.
*& Si la clase no coincide, busca el grupo solo por nombre.
*&---------------------------------------------------------------------*
FORM get_sets.
  DATA: lt_pc   TYPE ty_rng_t,
        lt_acct TYPE ty_rng_t,
        ls_rng  TYPE ty_rng,
        ls_pc   LIKE LINE OF gr_pc,
        ls_acct LIKE LINE OF gr_acct.

  PERFORM set_to_range USING '0106' p_pcgrp p_kokrs CHANGING lt_pc.
  PERFORM set_to_range USING '0H'   p_acgrp p_ktopl CHANGING lt_acct.

  LOOP AT lt_pc INTO ls_rng.
    CLEAR ls_pc.
    ls_pc-sign   = ls_rng-sign.
    ls_pc-option = ls_rng-option.
    ls_pc-low    = ls_rng-low.
    ls_pc-high   = ls_rng-high.
    IF ls_pc-low CO '0123456789 '.   "CeBe numérico: formato interno
      PERFORM alpha_in CHANGING ls_pc-low.
      IF ls_pc-high IS NOT INITIAL.
        PERFORM alpha_in CHANGING ls_pc-high.
      ENDIF.
    ENDIF.
    APPEND ls_pc TO gr_pc.
  ENDLOOP.

  LOOP AT lt_acct INTO ls_rng.
    CLEAR ls_acct.
    ls_acct-sign   = ls_rng-sign.
    ls_acct-option = ls_rng-option.
    ls_acct-low    = ls_rng-low.
    ls_acct-high   = ls_rng-high.
    IF ls_acct-low CO '0123456789 '.   "cuenta numérica: formato interno
      PERFORM alpha_in CHANGING ls_acct-low.
      IF ls_acct-high IS NOT INITIAL.
        PERFORM alpha_in CHANGING ls_acct-high.
      ENDIF.
    ENDIF.
    APPEND ls_acct TO gr_acct.
  ENDLOOP.

  IF gr_pc IS INITIAL OR gr_acct IS INITIAL.
    MESSAGE 'No se pudieron expandir los grupos (revise GS03)' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM set_to_range USING iv_class TYPE c iv_name TYPE c iv_sub TYPE c
                  CHANGING ct_range TYPE ty_rng_t.
  DATA: lt_todo  TYPE STANDARD TABLE OF ty_todo,
        ls_todo  TYPE ty_todo,
        ls_chk   TYPE ty_todo,
        lt_leaf  TYPE STANDARD TABLE OF setleaf,
        ls_leaf  TYPE setleaf,
        lt_node  TYPE STANDARD TABLE OF setnode,
        ls_node  TYPE setnode,
        ls_range TYPE ty_rng,
        lv_idx   TYPE i,
        lv_lin   TYPE i.

  CLEAR ls_todo.
  ls_todo-setclass = iv_class.
  ls_todo-subclass = iv_sub.
  ls_todo-setname  = iv_name.

  " Localiza el grupo: primero con clase y subclase, luego solo clase,
  " luego solo por nombre (por si la clase real es otra).
  SELECT SINGLE setclass subclass FROM setheader
    INTO (ls_chk-setclass, ls_chk-subclass)
    WHERE setclass = iv_class AND subclass = iv_sub AND setname = iv_name.
  IF sy-subrc <> 0.
    SELECT SINGLE setclass subclass FROM setheader
      INTO (ls_chk-setclass, ls_chk-subclass)
      WHERE setclass = iv_class AND setname = iv_name.
    IF sy-subrc <> 0.
      SELECT SINGLE setclass subclass FROM setheader
        INTO (ls_chk-setclass, ls_chk-subclass)
        WHERE setname = iv_name.
    ENDIF.
    IF sy-subrc = 0.
      ls_todo-setclass = ls_chk-setclass.
      ls_todo-subclass = ls_chk-subclass.
    ENDIF.
  ENDIF.
  APPEND ls_todo TO lt_todo.

  " Expande el grupo y sus subgrupos
  lv_idx = 1.
  DO.
    DESCRIBE TABLE lt_todo LINES lv_lin.
    IF lv_idx > lv_lin.
      EXIT.
    ENDIF.
    READ TABLE lt_todo INTO ls_todo INDEX lv_idx.
    lv_idx = lv_idx + 1.

    SELECT * FROM setleaf INTO TABLE lt_leaf
      WHERE setclass = ls_todo-setclass
        AND subclass = ls_todo-subclass
        AND setname  = ls_todo-setname.
    LOOP AT lt_leaf INTO ls_leaf.
      CLEAR ls_range.
      ls_range-sign = ls_leaf-valsign.
      IF ls_range-sign IS INITIAL.
        ls_range-sign = 'I'.
      ENDIF.
      ls_range-low  = ls_leaf-valfrom.
      ls_range-high = ls_leaf-valto.
      IF ls_range-high IS INITIAL OR ls_range-high = ls_range-low.
        ls_range-option = 'EQ'.
        CLEAR ls_range-high.
      ELSE.
        ls_range-option = 'BT'.
      ENDIF.
      APPEND ls_range TO ct_range.
    ENDLOOP.

    SELECT * FROM setnode INTO TABLE lt_node
      WHERE setclass = ls_todo-setclass
        AND subclass = ls_todo-subclass
        AND setname  = ls_todo-setname.
    LOOP AT lt_node INTO ls_node.
      CLEAR ls_chk.
      ls_chk-setclass = ls_node-subsetcls.
      ls_chk-subclass = ls_todo-subclass.   "el subgrupo hereda la subclase
      ls_chk-setname  = ls_node-subsetname.
      READ TABLE lt_todo TRANSPORTING NO FIELDS
        WITH KEY setclass = ls_chk-setclass
                 subclass = ls_chk-subclass
                 setname  = ls_chk-setname.
      IF sy-subrc <> 0.
        APPEND ls_chk TO lt_todo.
      ENDIF.
    ENDLOOP.
  ENDDO.
ENDFORM.

*&---------------------------------------------------------------------*
*& Lee los totales EC-PCA (GLPCT): RRCTY 0 = real, 1 = plan.
*&---------------------------------------------------------------------*
FORM get_data.
  DATA lv_rvers TYPE glpct-rvers.
  lv_rvers = p_rvers.
  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING
      input  = lv_rvers
    IMPORTING
      output = lv_rvers.

  SELECT * FROM glpct INTO TABLE gt_glpct
    WHERE rldnr  = p_rldnr
      AND rrcty IN (0, 1)
      AND rvers  = lv_rvers
      AND ryear  = p_ryear
      AND rbukrs = p_bukrs
      AND rprctr IN gr_pc
      AND racct  IN gr_acct.
ENDFORM.

FORM build_output.
  DATA: ls_out   TYPE ty_out,
        lv_idx   TYPE n LENGTH 2,
        lv_fn    TYPE string,
        lv_amt   TYPE p LENGTH 15 DECIMALS 2,
        lv_per   TYPE n LENGTH 3,
        lv_lastc TYPE glpct-rprctr,
        lv_lastt TYPE cepct-ltext,
        lv_ktext TYPE cepct-ktext,
        lv_datbi TYPE cepct-datbi.
  FIELD-SYMBOLS: <ls_g> TYPE glpct, <lv_v> TYPE any.

  LOOP AT gt_glpct ASSIGNING <ls_g>.
    CLEAR: ls_out, lv_amt.
    lv_per = p_perf.
    WHILE lv_per <= p_pert AND lv_per <= 16.
      lv_idx = lv_per.
      CONCATENATE 'HSL' lv_idx INTO lv_fn.
      ASSIGN COMPONENT lv_fn OF STRUCTURE <ls_g> TO <lv_v>.
      IF sy-subrc = 0.
        lv_amt = lv_amt + <lv_v>.
      ENDIF.
      lv_per = lv_per + 1.
    ENDWHILE.
    IF p_bypc = 'X'.
      ls_out-rprctr = <ls_g>-rprctr.
    ENDIF.
    ls_out-racct = <ls_g>-racct.
    IF <ls_g>-rrcty = '1'.
      ls_out-plan = lv_amt.
    ELSE.
      ls_out-real = lv_amt.
    ENDIF.
    COLLECT ls_out INTO gt_out.
  ENDLOOP.

  SORT gt_out BY rprctr racct.

  LOOP AT gt_out INTO ls_out.
    ls_out-desv = ls_out-real - ls_out-plan.
    IF ls_out-plan <> 0.
      ls_out-desvp = ls_out-desv / ls_out-plan * 100.
    ENDIF.
    SELECT SINGLE txt20 FROM skat INTO ls_out-txt20
      WHERE spras = sy-langu AND ktopl = p_ktopl AND saknr = ls_out-racct.

    " Descripción del CeBe (CEPCT): última vigencia; se reutiliza por CeBe
    IF ls_out-rprctr IS NOT INITIAL.
      IF ls_out-rprctr <> lv_lastc.
        lv_lastc = ls_out-rprctr.
        CLEAR: lv_lastt, lv_ktext.
        SELECT ltext ktext datbi FROM cepct INTO (lv_lastt, lv_ktext, lv_datbi)
          UP TO 1 ROWS
          WHERE spras = sy-langu
            AND prctr = ls_out-rprctr
            AND kokrs = p_kokrs
          ORDER BY datbi DESCENDING.
        ENDSELECT.
        IF lv_lastt IS INITIAL.
          lv_lastt = lv_ktext.
        ENDIF.
      ENDIF.
      ls_out-ptxt = lv_lastt.
    ENDIF.
    MODIFY gt_out FROM ls_out.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Importe a texto con punto decimal y signo al frente (para CSV)
*&---------------------------------------------------------------------*
FORM fmt_amt USING iv_amt TYPE p CHANGING cv_txt TYPE string.
  DATA lv_c TYPE c LENGTH 30.
  lv_c = iv_amt.
  CONDENSE lv_c NO-GAPS.
  IF lv_c CS '-'.
    REPLACE '-' WITH '' INTO lv_c.
    CONCATENATE '-' lv_c INTO lv_c.
  ENDIF.
  cv_txt = lv_c.
ENDFORM.

FORM build_csv CHANGING ct_csv TYPE ty_str_t.
  DATA: ls_out  TYPE ty_out,
        lv_line TYPE string,
        lv_ptxt TYPE string,
        lv_ctxt TYPE string,
        lv_plan TYPE string,
        lv_real TYPE string,
        lv_desv TYPE string,
        lv_pct  TYPE string.

  APPEND 'CeBe;Descripcion CeBe;Cuenta;Descripcion;Plan;Real;Desviacion;Desv%' TO ct_csv.
  LOOP AT gt_out INTO ls_out.
    PERFORM fmt_amt USING ls_out-plan  CHANGING lv_plan.
    PERFORM fmt_amt USING ls_out-real  CHANGING lv_real.
    PERFORM fmt_amt USING ls_out-desv  CHANGING lv_desv.
    PERFORM fmt_amt USING ls_out-desvp CHANGING lv_pct.
    lv_ptxt = ls_out-ptxt.
    lv_ctxt = ls_out-txt20.
    REPLACE ALL OCCURRENCES OF ';' IN lv_ptxt WITH ','.
    REPLACE ALL OCCURRENCES OF ';' IN lv_ctxt WITH ','.
    CONCATENATE ls_out-rprctr lv_ptxt ls_out-racct lv_ctxt
                lv_plan lv_real lv_desv lv_pct
           INTO lv_line SEPARATED BY ';'.
    APPEND lv_line TO ct_csv.
  ENDLOOP.
ENDFORM.

FORM export_csv_pc.
  DATA: lt_csv TYPE ty_str_t,
        lv_msg TYPE string.
  PERFORM build_csv CHANGING lt_csv.
  CALL METHOD cl_gui_frontend_services=>gui_download
    EXPORTING
      filename = p_file
      codepage = '4110'
    CHANGING
      data_tab = lt_csv
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc = 0.
    CONCATENATE 'CSV generado:' p_file INTO lv_msg SEPARATED BY space.
    MESSAGE lv_msg TYPE 'S'.
  ELSE.
    MESSAGE 'Error al descargar el CSV' TYPE 'S'.
  ENDIF.
ENDFORM.

FORM export_csv_server.
  DATA: lt_csv  TYPE ty_str_t,
        lv_line TYPE string,
        lv_msg  TYPE string.
  PERFORM build_csv CHANGING lt_csv.
  OPEN DATASET p_srv FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    CONCATENATE 'No se pudo abrir' p_srv INTO lv_msg SEPARATED BY space.
    MESSAGE lv_msg TYPE 'S'.
    RETURN.
  ENDIF.
  LOOP AT lt_csv INTO lv_line.
    TRANSFER lv_line TO p_srv.
  ENDLOOP.
  CLOSE DATASET p_srv.
ENDFORM.

FORM show_alv.
  DATA: lo_alv  TYPE REF TO cl_salv_table,
        lo_cols TYPE REF TO cl_salv_columns_table,
        lo_col  TYPE REF TO cl_salv_column,
        lo_func TYPE REF TO cl_salv_functions_list.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_out ).
      lo_func = lo_alv->get_functions( ).
      lo_func->set_all( abap_true ).
      lo_cols = lo_alv->get_columns( ).
      lo_cols->set_optimize( abap_true ).
      lo_col = lo_cols->get_column( 'PTXT' ).
      lo_col->set_short_text( 'Desc.CeBe' ).
      lo_col->set_medium_text( 'Descripción CeBe' ).
      lo_col->set_long_text( 'Descripción CeBe' ).
      lo_col = lo_cols->get_column( 'PLAN' ).
      lo_col->set_short_text( 'Plan' ).
      lo_col = lo_cols->get_column( 'REAL' ).
      lo_col->set_short_text( 'Real' ).
      lo_col = lo_cols->get_column( 'DESV' ).
      lo_col->set_short_text( 'Desv.' ).
      lo_col = lo_cols->get_column( 'DESVP' ).
      lo_col->set_short_text( 'Desv.%' ).
      lo_alv->display( ).
    CATCH cx_salv_msg cx_salv_not_found.
      MESSAGE 'No se pudo mostrar el ALV' TYPE 'S'.
  ENDTRY.
ENDFORM.
