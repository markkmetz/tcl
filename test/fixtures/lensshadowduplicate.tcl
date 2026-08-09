proc some_proc {

}


namespace eval shadow {

#used three times
    proc some_proc {} {
        
    }
    #first namespace call
    some_proc
}

#second namespace call
shadow::some_proc
#third namespace call
::shadow::some_proc

#first call of not ns
some_proc
