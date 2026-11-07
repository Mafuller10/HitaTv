sub init()
    m.bg = m.top.findNode("bg")
    m.poster = m.top.findNode("poster")
    m.cardTitle = m.top.findNode("cardTitle")
    m.titleBar = m.top.findNode("titleBar")
    m.title = m.top.findNode("title")
    m.badgeBg = m.top.findNode("badgeBg")
    m.badge = m.top.findNode("badge")
    m.progressBg = m.top.findNode("progressBg")
    m.progress = m.top.findNode("progress")
end sub

sub onContent()
    c = m.top.itemContent
    if c = invalid then return
    poster = c.hdPosterUrl
    m.poster.uri = poster
    hasPoster = (poster <> invalid and poster <> "")
    m.cardTitle.visible = not hasPoster
    m.cardTitle.text = c.title
    m.title.text = c.title

    src = ""
    itype = ""
    if c.hasField("source") then src = c.source
    if c.hasField("itemType") then itype = c.itemType
    m.badge.text = badgeLabel(src, itype)
    if isLiveType(itype)
        m.badgeBg.color = "0xFF4D2EFF"
        m.badgeBg.width = 140
        m.badge.width = 140
        ' Channel logos look best letterboxed on a lighter card; radio gets its own tint.
        m.bg.color = "0x2A2A34FF"
        if itype = "radio" then m.bg.color = "0x123B3AFF"
        if src = "famelack" and itype = "live" then m.bg.color = "0x2B2440FF"
    else
        m.badgeBg.color = "0x000000B0"
        m.badgeBg.width = 140
        m.badge.width = 140
        if src = "retrocrush"
            m.bg.color = "0x3B1E54FF"
        else if src = "fawesome"
            m.bg.color = "0x1E2A44FF"
        else
            m.bg.color = "0x1C1C24FF"
        end if
    end if

    p = 0.0
    if c.hasField("progress") then p = c.progress
    m.progressBg.visible = p > 0.01
    m.progress.width = m.bg.width * p
end sub

sub onSize()
    w = m.top.width
    h = m.top.height
    if w <= 0 or h <= 0 then return
    m.bg.width = w
    m.bg.height = h
    m.poster.width = w
    m.poster.height = h
    m.cardTitle.width = w - 40
    m.cardTitle.height = h
    m.titleBar.width = w
    m.titleBar.translation = [0, h - 48]
    m.title.width = w - 28
    m.progressBg.width = w
    m.progressBg.translation = [0, h - 6]
end sub
