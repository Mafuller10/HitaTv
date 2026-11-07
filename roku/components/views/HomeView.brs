sub init()
    m.rows = m.top.findNode("rows")
    m.heroImage = m.top.findNode("heroImage")
    m.heroTitle = m.top.findNode("heroTitle")
    m.heroMeta = m.top.findNode("heroMeta")
    m.heroDesc = m.top.findNode("heroDesc")
    m.status = m.top.findNode("status")
    m.nav = m.top.findNode("nav")
    m.navUnderline = m.top.findNode("navUnderline")
    m.navLabels = []
    for i = 0 to 4
        m.navLabels.Push(m.top.findNode("nav" + i.ToStr()))
    end for
    m.navViews = ["home", "live", "movies", "anime", "search"]
    m.navIndex = 0
    m.navFocused = false
    m.reqId = 0
    m.lastFocus = invalid

    m.rows.observeField("rowItemFocused", "onRowItemFocused")
    m.rows.observeField("rowItemSelected", "onRowItemSelected")
    m.top.observeField("focusedChild", "onFocusChanged")
    updateNav()
end sub

' ---------------------------------------------------------------- data

sub loadView()
    task = m.top.catalogTask
    if task = invalid then return
    if m.resultObserved <> true
        task.observeFieldScoped("result", "onResult")
        m.resultObserved = true
    end if
    m.reqId = m.reqId + 1
    m.status.text = "Loading…"
    task.request = { reqId: "home-" + m.reqId.ToStr(), cmd: "view", view: m.top.view }
end sub

' Called when we come back from Details/Player: rebuild personalised rows, keep focus position.
sub onRefresh()
    m.lastFocus = m.rows.rowItemFocused
    loadView()
end sub

sub onResult()
    r = m.top.catalogTask.result
    if r = invalid or r.reqId <> "home-" + m.reqId.ToStr() then return
    content = r.content
    m.rows.content = content
    if content.getChildCount() = 0
        m.status.text = "Nothing here yet."
        return
    end if
    m.status.text = ""
    if m.lastFocus <> invalid and m.lastFocus.Count() = 2 and m.lastFocus[0] < content.getChildCount()
        row = content.getChild(m.lastFocus[0])
        col = m.lastFocus[1]
        if col >= row.getChildCount() then col = 0
        m.rows.jumpToRowItem = [m.lastFocus[0], col]
    end if
    m.lastFocus = invalid
    showHero(content.getChild(0).getChild(0))
    ' Move focus into the rows unless the user is deliberately on the nav bar.
    if m.top.isInFocusChain() and (not m.navFocused or m.autoNav = true)
        m.autoNav = false
        m.navFocused = false
        m.rows.setFocus(true)
        updateNav()
    end if
end sub

' ---------------------------------------------------------------- hero

sub onRowItemFocused()
    f = m.rows.rowItemFocused
    if f = invalid or m.rows.content = invalid then return
    row = m.rows.content.getChild(f[0])
    if row = invalid then return
    showHero(row.getChild(f[1]))
end sub

sub showHero(item as object)
    if item = invalid then return
    img = item.backdrop
    if img = invalid or img = "" then img = item.hdPosterUrl
    m.heroImage.loadDisplayMode = "scaleToZoom"
    if item.source = "iptv" then m.heroImage.loadDisplayMode = "scaleToFit"
    m.heroImage.uri = img
    m.heroTitle.text = item.title

    parts = []
    if item.source = "iptv"
        parts.Push("LIVE")
    else
        if item.year > 0 then parts.Push(item.year.ToStr())
        if item.durationSec > 0 then parts.Push(fmtDuration(item.durationSec))
        if item.rating <> "" then parts.Push(item.rating)
    end if
    if item.genresText <> "" then parts.Push(item.genresText)
    if item.source = "fawesome" or item.source = "retrocrush" then parts.Push("on " + item.extApp)
    m.heroMeta.text = joinArr(parts, "  •  ")
    m.heroDesc.text = item.description
end sub

sub onRowItemSelected()
    f = m.rows.rowItemSelected
    row = m.rows.content.getChild(f[0])
    if row <> invalid then m.top.itemSelected = row.getChild(f[1])
end sub

' ---------------------------------------------------------------- nav + focus

sub updateNav()
    current = 0
    for i = 0 to m.navViews.Count() - 1
        if m.navViews[i] = m.top.view then current = i
    end for
    for i = 0 to m.navLabels.Count() - 1
        lbl = m.navLabels[i]
        if m.navFocused and i = m.navIndex
            lbl.color = "0xFFFFFFFF"
            lbl.font = "font:MediumBoldSystemFont"
        else if i = current
            lbl.color = "0xFFFFFFFF"
            lbl.font = "font:MediumSystemFont"
        else
            lbl.color = "0x8C8C8CFF"
            lbl.font = "font:MediumSystemFont"
        end if
    end for
    ' Underline the focused (or current) nav entry.
    idx = current
    if m.navFocused then idx = m.navIndex
    rect = m.navLabels[idx].boundingRect()
    navX = m.nav.translation[0]
    m.navUnderline.translation = [navX + rect.x, 104]
    m.navUnderline.width = rect.width
    m.navUnderline.visible = (rect.width > 0)
end sub

sub onFocusChanged()
    if m.top.hasFocus()
        ' The view itself got focus (e.g. after popView) -> hand it to the right child.
        if m.navFocused
            updateNav()
        else if m.rows.content <> invalid and m.rows.content.getChildCount() > 0
            m.rows.setFocus(true)
        else
            ' Nothing loaded yet: park focus on the nav until rows arrive.
            m.navFocused = true
            m.autoNav = true
            updateNav()
        end if
    end if
end sub

sub focusNav(on as boolean)
    m.navFocused = on
    if on
        for i = 0 to m.navViews.Count() - 1
            if m.navViews[i] = m.top.view then m.navIndex = i
        end for
        m.top.setFocus(true)
    else
        m.rows.setFocus(true)
    end if
    updateNav()
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if m.navFocused
        m.autoNav = false
        if key = "left" and m.navIndex > 0
            m.navIndex = m.navIndex - 1
            updateNav()
            return true
        else if key = "right" and m.navIndex < m.navViews.Count() - 1
            m.navIndex = m.navIndex + 1
            updateNav()
            return true
        else if key = "OK"
            target = m.navViews[m.navIndex]
            if target = "search"
                m.top.navAction = "search"
            else if target <> m.top.view
                m.lastFocus = invalid
                m.top.view = target
                focusNav(false)
            else
                focusNav(false)
            end if
            return true
        else if key = "down"
            if m.rows.content <> invalid and m.rows.content.getChildCount() > 0 then focusNav(false)
            return true
        end if
        return key = "left" or key = "right" or key = "up"
    end if
    ' RowList didn't handle "up" -> we're on the top row: move to the nav.
    if key = "up"
        focusNav(true)
        return true
    end if
    return false
end function
