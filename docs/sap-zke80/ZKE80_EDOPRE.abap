*&---------------------------------------------------------------------*
*& Report ZKE80_EDOPRE
*& Clon de KE80 (EC-PCA, informe Z8-PCA001G / grupo EDOPRE):
*& Plan / Real / Desviación por grupo de CeBe y grupo de cuentas,
*& con ALV y exportación a CSV.
*&---------------------------------------------------------------------*
REPORT zke80_edopre.

TYPES: BEGIN OF ty_out,
         rprctr TYPE glpct-rprctr,
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
       ty_rng_t TYPE STANDARD TABLE OF ty_rng WITH DEFAULT KEY.

DATA: gt_out   TYPE STANDARD TABLE OF ty_out,
      gt_glpct TYPE STANDARD TABLE OF glpct,
      gr_pc    TYPE RANGE OF glpct-rprctr,
      gr_acct  TYPE RANGE OF glpct-racct.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_perf  TYPE n LENGTH 3 DEFAULT '009' OBLIGATORY,   "De período
            p_pert  TYPE n LENGTH 3 DEFAULT '009' OBLIGATORY,   "A período
            p_ryear TYPE glpct-ryear DEFAULT sy-datum(4) OBLIGATORY, "Ejercicio
            p_rvers TYPE c LENGTH 3 DEFAULT '0' OBLIGATORY,     "Versión plan
            p_bukrs TYPE glpct-rbukrs DEFAULT 'KF01' OBLIGATORY, "Sociedad
            p_rldnr TYPE glpct-rldnr DEFAULT '8A' OBLIGATORY,   "Ledger EC-PCA
            p_kokrs TYPE tka01-kokrs OBLIGATORY,                "Área de CeBe
            p_ktopl TYPE ska1-ktopl  OBLIGATORY.                "Plan de cuentas
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_pcgrp TYPE c LENGTH 24 DEFAULT 'VAQUERO' OBLIGATORY, "Grupo de CeBe
            p_acgrp TYPE c LENGTH 24 DEFAULT 'EDOPRE'  OBLIGATORY, "Gpo.ctas.resultados
            p_bypc  AS CHECKBOX.                                   "Desglosar por CeBe
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
PARAMETERS: p_alv  AS CHECKBOX DEFAULT 'X',
            p_file TYPE string LOWER CASE,     "CSV en PC (primer plano)
            p_srv  TYPE string LOWER CASE.     "CSV en servidor (fondo)
SELECTION-SCREEN END OF BLOCK b3.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.
  DATA: lv_name TYPE string, lv_path TYPE string, lv_full TYPE string.
  cl_gui_frontend_services=>file_save_dialog(
    EXPORTING default_extension = 'csv' default_file_name = 'ke80_edopre.csv'
    CHANGING  filename = lv_name path = lv_path fullpath = lv_full ).
  IF lv_full IS NOT INITIAL.
    p_file = lv_full.
  ENDIF.

START-OF-SELECTION.
  PERFORM get_sets.
  PERFORM get_data.
  PERFORM build_output.
  IF gt_out IS INITIAL.
    MESSAGE 'Sin datos para la selección' TYPE 'S' DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.
  IF p_file IS NOT INITIAL.
    PERFORM export_csv_pc.
  ENDIF.
  IF p_srv IS NOT INITIAL.
    PERFORM export_csv_server.
  ENDIF.
  IF p_alv = abap_true.
    PERFORM show_alv.
  ENDIF.

*&---------------------------------------------------------------------*
*& Expande los grupos (GS03): CeBe clase 0106, cuentas clase 0H.
*& VERIFICAR en GS03 la clase del grupo EDOPRE y el subconjunto.
*&---------------------------------------------------------------------*
FORM get_sets.
  DATA: lt_pc   TYPE ty_rng_t,
        lt_acct TYPE ty_rng_t,
        ls_rng  TYPE ty_rng,
        ls_pc   LIKE LINE OF gr_pc,
        ls_acct LIKE LINE OF gr_acct.

  PERFORM set_to_range USING '0106' p_pcgrp p_kokrs ''      CHANGING lt_pc.
  PERFORM set_to_range USING '0H'   p_acgrp ''      p_ktopl CHANGING lt_acct.

  LOOP AT lt_pc INTO ls_rng.
    CLEAR ls_pc.
    ls_pc-sign   = ls_rng-sign.
    ls_pc-option = ls_rng-option.
    ls_pc-low    = ls_rng-low.
    ls_pc-high   = ls_rng-high.
    IF ls_pc-low CO '0123456789 '.   "CeBe numérico: formato interno
      ls_pc-low = |{ ls_pc-low ALPHA = IN }|.
      IF ls_pc-high IS NOT INITIAL. ls_pc-high = |{ ls_pc-high ALPHA = IN }|. ENDIF.
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
      ls_acct-low = |{ ls_acct-low ALPHA = IN }|.
      IF ls_acct-high IS NOT INITIAL. ls_acct-high = |{ ls_acct-high ALPHA = IN }|. ENDIF.
    ENDIF.
    APPEND ls_acct TO gr_acct.
  ENDLOOP.

  IF gr_pc IS INITIAL OR gr_acct IS INITIAL.
    MESSAGE 'No se pudieron expandir los grupos (revise GS03)' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM set_to_range USING iv_class TYPE c iv_name TYPE c
                        iv_kokrs TYPE c iv_ktopl TYPE c
                  CHANGING ct_range TYPE ty_rng_t.
  DATA: lv_setid  TYPE sethier-setid,
        lt_values TYPE STANDARD TABLE OF rgsbv,
        ls_range  TYPE ty_rng.
  FIELD-SYMBOLS: <ls_val> TYPE rgsbv, <lv_f> TYPE any.

  CALL FUNCTION 'G_SET_ENCRYPT_SETID'
    EXPORTING setclass  = iv_class
              shortname = iv_name
              kokrs     = iv_kokrs
              ktopl     = iv_ktopl
    IMPORTING setid     = lv_setid.

  CALL FUNCTION 'G_SET_GET_ALL_VALUES'
    EXPORTING setnr      = lv_setid
    TABLES    set_values = lt_values
    EXCEPTIONS OTHERS    = 1.
  IF sy-subrc <> 0. RETURN. ENDIF.

  LOOP AT lt_values ASSIGNING <ls_val>.
    CLEAR ls_range.
    ls_range-sign = 'I'.
    " Nombres de campo de RGSBV: ajustar VFROM/VTO ó FROM/TO según SE11
    ASSIGN COMPONENT 'VFROM' OF STRUCTURE <ls_val> TO <lv_f>.
    IF sy-subrc <> 0. ASSIGN COMPONENT 'FROM' OF STRUCTURE <ls_val> TO <lv_f>. ENDIF.
    ls_range-low = <lv_f>.
    ASSIGN COMPONENT 'VTO' OF STRUCTURE <ls_val> TO <lv_f>.
    IF sy-subrc <> 0. ASSIGN COMPONENT 'TO' OF STRUCTURE <ls_val> TO <lv_f>. ENDIF.
    ls_range-high = <lv_f>.
    IF ls_range-high IS INITIAL OR ls_range-high = ls_range-low.
      ls_range-option = 'EQ'. CLEAR ls_range-high.
    ELSE.
      ls_range-option = 'BT'.
    ENDIF.
    APPEND ls_range TO ct_range.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Lee los totales EC-PCA (GLPCT): RRCTY 0 = real, 1 = plan.
*&---------------------------------------------------------------------*
FORM get_data.
  DATA lv_rvers TYPE glpct-rvers.
  lv_rvers = |{ p_rvers ALPHA = IN }|.
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
  DATA: ls_out TYPE ty_out, lv_idx TYPE n LENGTH 2, lv_fn TYPE string,
        lv_amt TYPE p LENGTH 15 DECIMALS 2, lv_per TYPE n LENGTH 3.
  FIELD-SYMBOLS: <ls_g> TYPE glpct, <lv_v> TYPE any.

  LOOP AT gt_glpct ASSIGNING <ls_g>.
    CLEAR: ls_out, lv_amt.
    lv_per = p_perf.
    WHILE lv_per <= p_pert AND lv_per <= 16.
      lv_idx = lv_per.
      lv_fn  = |HSL{ lv_idx }|.
      ASSIGN COMPONENT lv_fn OF STRUCTURE <ls_g> TO <lv_v>.
      IF sy-subrc = 0. lv_amt = lv_amt + <lv_v>. ENDIF.
      lv_per = lv_per + 1.
    ENDWHILE.
    IF p_bypc = abap_true. ls_out-rprctr = <ls_g>-rprctr. ENDIF.
    ls_out-racct = <ls_g>-racct.
    IF <ls_g>-rrcty = '1'. ls_out-plan = lv_amt. ELSE. ls_out-real = lv_amt. ENDIF.
    COLLECT ls_out INTO gt_out.
  ENDLOOP.

  LOOP AT gt_out INTO ls_out.
    ls_out-desv = ls_out-real - ls_out-plan.
    IF ls_out-plan <> 0.
      ls_out-desvp = ls_out-desv / ls_out-plan * 100.
    ENDIF.
    SELECT SINGLE txt20 FROM skat INTO ls_out-txt20
      WHERE spras = sy-langu AND ktopl = p_ktopl AND saknr = ls_out-racct.
    MODIFY gt_out FROM ls_out.
  ENDLOOP.
  SORT gt_out BY rprctr racct.
ENDFORM.

*&---------------------------------------------------------------------*
FORM build_csv CHANGING ct_csv TYPE string_table.
  DATA: ls_out TYPE ty_out, lv_line TYPE string.
  APPEND 'CeBe;Cuenta;Descripcion;Plan;Real;Desviacion;Desv%' TO ct_csv.
  LOOP AT gt_out INTO ls_out.
    lv_line = |{ ls_out-rprctr };{ ls_out-racct };{ ls_out-txt20 };| &&
              |{ ls_out-plan NUMBER = RAW DECIMALS = 2 };| &&
              |{ ls_out-real NUMBER = RAW DECIMALS = 2 };| &&
              |{ ls_out-desv NUMBER = RAW DECIMALS = 2 };| &&
              |{ ls_out-desvp NUMBER = RAW DECIMALS = 2 }|.
    APPEND lv_line TO ct_csv.
  ENDLOOP.
ENDFORM.

FORM export_csv_pc.
  DATA lt_csv TYPE string_table.
  PERFORM build_csv CHANGING lt_csv.
  cl_gui_frontend_services=>gui_download(
    EXPORTING filename = p_file codepage = '4110' write_bom = abap_true
    CHANGING  data_tab = lt_csv
    EXCEPTIONS OTHERS = 1 ).
  IF sy-subrc = 0.
    MESSAGE |CSV generado: { p_file }| TYPE 'S'.
  ELSE.
    MESSAGE 'Error al descargar el CSV' TYPE 'W'.
  ENDIF.
ENDFORM.

FORM export_csv_server.
  DATA: lt_csv TYPE string_table, lv_line TYPE string.
  PERFORM build_csv CHANGING lt_csv.
  OPEN DATASET p_srv FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    MESSAGE |No se pudo abrir { p_srv } en el servidor| TYPE 'W'. RETURN.
  ENDIF.
  LOOP AT lt_csv INTO lv_line.
    TRANSFER lv_line TO p_srv.
  ENDLOOP.
  CLOSE DATASET p_srv.
ENDFORM.

FORM show_alv.
  DATA lo_alv TYPE REF TO cl_salv_table.
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_out ).
      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->get_columns( )->set_optimize( abap_true ).
      lo_alv->get_columns( )->get_column( 'PLAN'  )->set_short_text( 'Plan' ).
      lo_alv->get_columns( )->get_column( 'REAL'  )->set_short_text( 'Real' ).
      lo_alv->get_columns( )->get_column( 'DESV'  )->set_short_text( 'Desv.' ).
      lo_alv->get_columns( )->get_column( 'DESVP' )->set_short_text( 'Desv.%' ).
      lo_alv->display( ).
    CATCH cx_salv_msg cx_salv_not_found.
  ENDTRY.
ENDFORM.
