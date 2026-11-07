sub init()
    m.backdrop = m.top.findNode("backdrop")
    m.art = m.top.findNode("art")
    m.artTitle = m.top.findNode("artTitle")
    m.title = m.top.findNode("title")
    m.meta = m.top.findNode("meta")
    m.genres = m.top.findNode("genres")
    m.desc = m.top.findNode("desc")
    m.note = m.top.findNode("note")
    m.buttons = m.top.findNode("buttons")
    m.similar = m.top.findNode("similar")
    m.actions = []
    m.similarFocused = false

    m.buttons.observeField("buttonSelected", "onButton")
    m.similar.observeField("rowItemSelected", "onSimilarSelected")
    m.top.observeField("focusedChild", "onFocusChanged")
end sub

sub onContent()
    c = m.top.content
    if c = invalid then return
    img = c.backdrop
    if img = "" then img = c.hdPosterUrl
    m.backdrop.uri = img
    m.art.uri = c.hdPosterUrl
    m.artTitle.text = c.title
    m.artTitle.visible = (c.hdPosterUrl = "")
    m.title.text = c.title

    parts = []
    if c.source = "iptv"
        parts.Push("LIVE CHANNEL")
        if c.country <> "" then parts.Push(c.country)
    else
        if c.year > 0 then parts.Push(c.year.ToStr())
        if c.durationSec > 0 then parts.Push(fmtDuration(c.durationSec))
        if c.rating <> "" then parts.Push(c.rating)
        if c.itemType = "series" then parts.Push("Series")
    end if
    parts.Push(sourceLabel(c.source))
    m.meta.text = joinArr(parts, "  •  ")
    m.genres.text = c.genresText
    m.desc.text = c.description

    if c.source = "archive"
        m.note.text = "Public-domain film from the Internet Archive (archive.org)."
    else if c.source = "iptv"
        m.note.text = "Free public stream listed by the iptv-org community project. Some channels go offline without notice."
    else if c.playable = false
        m.note.text = "Streams in the official " + c.extApp + " app (free, ad-supported). HitaTV opens it for you."
    end if

    updateButtons()

    task = m.top.catalogTask
    if task <> invalid
        task.observeFieldScoped("result", "onResult")
        m.reqId = "similar-" + c.id + "-" + nowSec().ToStr()
        task.request = { reqId: m.reqId, cmd: "similar", id: c.id }
    end if
    m.buttons.setFocus(true)
end sub

sub updateButtons()
    c = m.top.content
    if c = invalid then return
    labels = []
    m.actions = []
    if c.playable
        resumeAt = hist_resumePosition(c.id)
        if resumeAt > 0
            labels.Push("Resume from " + fmtClock(resumeAt))
            m.actions.Push({ type: "play", startAt: resumeAt })
            labels.Push("Start Over")
            m.actions.Push({ type: "play", startAt: 0 })
        else if c.source = "iptv"
            labels.Push("Watch Live")
            m.actions.Push({ type: "play", startAt: 0 })
        else
            labels.Push("Play")
            m.actions.Push({ type: "play", startAt: 0 })
        end if
    else
        labels.Push("Open in " + c.extApp)
        m.actions.Push({ type: "launch" })
        labels.Push("Show Web Link")
        m.actions.Push({ type: "weblink" })
    end if
    if hist_inList(c.id)
        labels.Push("Remove from My List")
    else
        labels.Push("Add to My List")
    end if
    m.actions.Push({ type: "mylist" })
    m.buttons.buttons = labels
end sub

sub onButton()
    idx = m.buttons.buttonSelected
    a = m.actions[idx]
    if a = invalid then return
    c = m.top.content
    if a.type = "mylist"
        hist_toggleList(c.id)
        updateButtons()
        m.buttons.focusButton = idx
        return
    end if
    if a.type = "launch"
        ' Opening a partner title counts as interest for recommendations.
        hist_record(c.id, 0, 0, true)
    end if
    out = { type: a.type, item: c }
    if a.startAt <> invalid then out.startAt = a.startAt
    m.top.action = out
end sub

sub onResult()
    r = m.top.catalogTask.result
    if r = invalid or r.reqId <> m.reqId then return
    m.similar.content = r.content
    m.top.catalogTask.unobserveFieldScoped("result")
end sub

sub onSimilarSelected()
    f = m.similar.rowItemSelected
    row = m.similar.content.getChild(f[0])
    if row <> invalid then m.top.itemSelected = row.getChild(f[1])
end sub

sub onFocusChanged()
    if m.top.hasFocus()
        if m.similarFocused then m.similar.setFocus(true) else m.buttons.setFocus(true)
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "down" and not m.similarFocused
        if m.similar.content <> invalid and m.similar.content.getChildCount() > 0
            m.similarFocused = true
            m.similar.setFocus(true)
            return true
        end if
    else if key = "up" and m.similarFocused
        m.similarFocused = false
        m.buttons.setFocus(true)
        return true
    end if
    return false
end function
