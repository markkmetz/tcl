# Fixture: depends on proc from source-order-b.tcl
proc callShared {} {
  return [sharedProc 42]
}

set _source_order_result [callShared]
