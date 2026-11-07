sub init()
    m.keyboard = m.top.findNode("keyboard")
    m.grid = m.top.findNode("grid")
    m.hint = m.top.findNode("hint")
    m.debounce = m.top.findNode("debounce")
    m.reqN = 0
    m.gridFocused = false

    m.keyboard.observeField("text", "onText")
    m.debounce.observeField("fire", "runSearch")
    m.grid.observeField("itemSelected", "onGridSelected")
    m.top.observeField("focusedChild", "onFocusChanged")
end sub

sub onText()
    m.debounce.control = "stop"
    m.debounce.control = "start"
end sub

sub runSearch()
    task = m.top.catalogTask
    if task = invalid then return
    if m.observing <> true
        task.observeFieldScoped("result", "onResult")
        m.observing = true
    end if
    q = m.keyboard.text
    if Len(q.Trim()) < 2
        m.grid.content = invalid
        m.hint.text = "Type a title, or a genre like horror, western, anime or news."
        return
    end if
    m.reqN = m.reqN + 1
    task.request = { reqId: "search-" + m.reqN.ToStr(), cmd: "search", q: q }
end sub

sub onResult()
    r = m.top.catalogTask.result
    if r = invalid or r.reqId <> "search-" + m.reqN.ToStr() then return
    row = r.content.getChild(0)
    if row = invalid
        m.grid.content = invalid
        m.hint.text = "No matches for “" + m.keyboard.text + "”."
    else
        m.grid.content = row
        m.hint.text = row.getChildCount().ToStr() + " results"
    end if
end sub

sub onGridSelected()
    if m.grid.content = invalid then return
    m.top.itemSelected = m.grid.content.getChild(m.grid.itemSelected)
end sub

sub onFocusChanged()
    if m.top.hasFocus()
        if m.gridFocused then m.grid.setFocus(true) else m.keyboard.setFocus(true)
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "right" and not m.gridFocused and m.grid.content <> invalid
        m.gridFocused = true
        m.grid.setFocus(true)
        return true
    else if key = "left" and m.gridFocused
        m.gridFocused = false
        m.keyboard.setFocus(true)
        return true
    end if
    return false
end function
