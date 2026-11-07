' Watch history + My List, persisted in the Roku registry.
' The registry is small (16 KB per channel), so entries are compact and pruned:
'   h.items[id] = { p: positionSec, d: durationSec (0 = live), t: lastWatchedEpoch, n: playCount }
'   h.list      = [ id, ... ]   (My List)
' Requires Utils.brs.

function hist_section() as object
    return CreateObject("roRegistrySection", "HitaTV")
end function

function hist_load() as object
    sec = hist_section()
    if sec.Exists("h")
        h = ParseJson(sec.Read("h"))
        if h <> invalid and h.items <> invalid and h.list <> invalid then return h
    end if
    return { v: 1, items: {}, list: [] }
end function

sub hist_save(h as object)
    ' Prune to the 70 most recent entries to stay well inside the registry limit.
    maxItems = 70
    if h.items.Count() > maxItems
        arr = []
        for each id in h.items
            arr.Push({ id: id, t: h.items[id].t })
        end for
        arr.SortBy("t", "r")
        keep = {}
        for i = 0 to maxItems - 1
            keep[arr[i].id] = h.items[arr[i].id]
        end for
        h.items = keep
    end if
    while h.list.Count() > 50
        h.list.Pop()
    end while
    sec = hist_section()
    sec.Write("h", FormatJson(h))
    sec.Flush()
end sub

' Completion ratio 0..1. Live channels count 30 minutes of viewing as "complete".
function hist_completion(e as object) as float
    if e = invalid then return 0
    if e.d > 0 then
        c = e.p / e.d
    else
        c = e.p / 1800.0
    end if
    if c > 1 then c = 1
    return c
end function

function hist_get(id as string) as object
    h = hist_load()
    return h.items[id]
end function

' Called when playback starts (counts a play) and periodically during playback (updates position).
sub hist_record(id as string, positionSec as integer, durationSec as integer, isNewPlay as boolean)
    h = hist_load()
    e = h.items[id]
    if e = invalid then e = { p: 0, d: 0, t: 0, n: 0 }
    if durationSec > 0
        e.p = positionSec
        e.d = durationSec
    else
        ' Live: accumulate watched time instead of position.
        if isNewPlay = false then e.p = e.p + positionSec
        e.d = 0
    end if
    if isNewPlay then e.n = e.n + 1
    e.t = nowSec()
    h.items[id] = e
    hist_save(h)
end sub

function hist_resumePosition(id as string) as integer
    e = hist_get(id)
    if e = invalid or e.d <= 0 then return 0
    c = hist_completion(e)
    if c > 0.03 and c < 0.92 then return e.p
    return 0
end function

function hist_inList(id as string) as boolean
    h = hist_load()
    for each x in h.list
        if x = id then return true
    end for
    return false
end function

' Returns the new state (true = now in list).
function hist_toggleList(id as string) as boolean
    h = hist_load()
    newList = []
    found = false
    for each x in h.list
        if x = id then
            found = true
        else
            newList.Push(x)
        end if
    end for
    if not found then newList.Unshift(id)
    h.list = newList
    hist_save(h)
    return not found
end function
