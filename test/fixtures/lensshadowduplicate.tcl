namespace eval shadow {
    # This namespaced proc should resolve only its own call sites.
    proc lensShadowDupProc {} {
    }

    # First namespaced call (unqualified inside namespace block)
    lensShadowDupProc
}

# Second namespaced call (qualified)
shadow::lensShadowDupProc

# Third namespaced call (fully qualified)
::shadow::lensShadowDupProc
