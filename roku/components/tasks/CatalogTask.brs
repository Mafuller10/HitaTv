sub init()
    m.top.functionName = "taskMain"
end sub

sub taskMain()
    port = CreateObject("roMessagePort")
    m.top.observeField("request", port)

    m.catalog = loadCatalog()
    if m.catalog = invalid
        m.top.statusMessage = "Couldn't load the catalog. Check your internet connection."
        m.top.status = "error"
        return
    end if
    m.top.status = "ready"

    while true
        msg = wait(0, port)
        if type(msg) = "roSGNodeEvent" and msg.GetField() = "request"
            handleRequest(msg.GetData())
        end if
    end while
end sub

' ---------------------------------------------------------------- loading

function loadCatalog() as object
    url = CreateObject("roAppInfo").GetValue("catalog_url")
    cachePath = "cachefs:/catalog.json"
    if url <> invalid and url <> ""
        xfer = CreateObject("roUrlTransfer")
        xfer.SetUrl(url)
        xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
        xfer.InitClientCertificates()
        xfer.EnableEncodings(true)
        body = xfer.GetToString()
        if body <> invalid and Len(body) > 100
            c = ParseJson(body)
            if isValidCatalog(c)
                WriteAsciiFile(cachePath, body)
                return c
            end if
        end if
        print "[CatalogTask] remote catalog unavailable, falling back"
    end if
    for each path in [cachePath, "pkg:/data/catalog.json"]
        body = ReadAsciiFile(path)
        if body <> invalid and Len(body) > 100
            c = ParseJson(body)
            if isValidCatalog(c) then return c
        end if
    end for
    return invalid
end function

function isValidCatalog(c as dynamic) as boolean
    return c <> invalid and type(c) = "roAssociativeArray" and c.items <> invalid and c.rows <> invalid
end function

' ---------------------------------------------------------------- requests

sub handleRequest(req as object)
    if req = invalid or req.cmd = invalid then return
    h = hist_load()
    content = CreateObject("roSGNode", "ContentNode")
    if req.cmd = "view"
        buildView(content, req.view, h)
    else if req.cmd = "similar"
        it = m.catalog.items[req.id]
        if it <> invalid and it.similar <> invalid then addRow(content, "More Like This", it.similar, h)
    else if req.cmd = "search"
        addRow(content, "Results", search(s(req.q)), h)
    end if
    m.top.result = { reqId: req.reqId, cmd: req.cmd, content: content }
end sub

sub buildView(content as object, view as string, h as object)
    items = m.catalog.items

    ' Personalised rows first.
    if view = "home"
        addRow(content, "Continue Watching", rec_continueWatching(h, items), h)
        addRow(content, "Recommended for You", rec_recommend(h, items, 30, ""), h)
        byw = rec_becauseYouWatched(h, items, "")
        if byw <> invalid then addRow(content, "Because You Watched " + byw.title, byw.ids, h)
        addRow(content, "My List", h.list, h)
    else if view = "live"
        recentLive = []
        for each r in rec_recent(h, items, "live")
            recentLive.Push(r.id)
        end for
        addRow(content, "Recently Watched Channels", recentLive, h)
        addRow(content, "Recommended Channels", rec_recommend(h, items, 30, "live"), h)
    else if view = "movies"
        addRow(content, "Recommended Movies & Shows", rec_recommend(h, items, 30, "vod"), h)
        byw = rec_becauseYouWatched(h, items, "vod")
        if byw <> invalid then addRow(content, "Because You Watched " + byw.title, byw.ids, h)
    else if view = "anime"
        addRow(content, "Recommended Anime & Cartoons", rec_recommend(h, items, 30, "anime"), h)
    end if

    ' Then the editorial rows the builder made for this view.
    for each row in m.catalog.rows
        for each v in row.views
            if v = view
                addRow(content, row.title, row.itemIds, h)
                exit for
            end if
        end for
    end for
end sub

function search(q as string) as object
    q = LCase(q.Trim())
    if Len(q) < 2 then return []
    prefix = []
    other = []
    for each id in m.catalog.items
        it = m.catalog.items[id]
        t = LCase(it.title)
        hit = Instr(1, t, q)
        if hit = 1
            prefix.Push({ id: id, p: it.popularity })
        else if hit > 1
            other.Push({ id: id, p: it.popularity })
        else
            for each g in it.genres
                if g = q
                    other.Push({ id: id, p: it.popularity - 1 })
                    exit for
                end if
            end for
        end if
    end for
    prefix.SortBy("p", "r")
    other.SortBy("p", "r")
    out = []
    for each x in prefix
        out.Push(x.id)
    end for
    for each x in other
        if out.Count() >= 60 then exit for
        out.Push(x.id)
    end for
    return out
end function

' ---------------------------------------------------------------- node building

sub addRow(content as object, title as string, ids as dynamic, h as object)
    if ids = invalid or ids.Count() = 0 then return
    row = CreateObject("roSGNode", "ContentNode")
    row.title = title
    count = 0
    for each id in ids
        it = m.catalog.items[id]
        if it <> invalid
            row.appendChild(makeItemNode(it, h.items[id]))
            count = count + 1
            if count >= 40 then exit for
        end if
    end for
    if count > 0 then content.appendChild(row)
end sub

function makeItemNode(it as object, histEntry as dynamic) as object
    node = CreateObject("roSGNode", "ContentNode")
    node.id = it.id
    node.title = s(it.title)
    node.description = s(it.description)
    node.hdPosterUrl = s(it.poster)
    node.fhdPosterUrl = s(it.poster)

    url = ""
    fmt = ""
    streamsJson = "[]"
    if it.streams <> invalid and it.streams.Count() > 0
        url = s(it.streams[0].url)
        fmt = s(it.streams[0].format)
        streamsJson = FormatJson(it.streams)
    end if
    node.url = url
    node.streamFormat = fmt

    ext = it.external
    extApp = ""
    extId = ""
    extType = ""
    extUrl = ""
    if ext <> invalid
        extApp = s(ext.appName)
        extId = s(ext.contentId)
        extType = s(ext.mediaType)
        extUrl = s(ext.webUrl)
    end if

    progress = 0.0
    if histEntry <> invalid and histEntry.d > 0 then progress = hist_completion(histEntry)

    playable = false
    if it.playable = true then playable = true

    node.addFields({
        source: s(it.source),
        itemType: s(it.type),
        playable: playable,
        genresText: joinArr(it.genres, ", "),
        backdrop: s(it.backdrop),
        year: n(it.year),
        durationSec: n(it.durationSec),
        rating: s(it.rating),
        country: s(it.country),
        streamsJson: streamsJson,
        extApp: extApp,
        extContentId: extId,
        extMediaType: extType,
        extWebUrl: extUrl,
        progress: progress
    })
    return node
end function
