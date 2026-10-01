export function visibleChatPanels(panels: string[], validIds: string[], activeId: string) {
  const existing = panels.filter((id) => validIds.includes(id))
  return existing.length > 1 && existing.includes(activeId) ? existing : [activeId]
}

export function removePanelFromGroups(groups: string[][], tabId: string) {
  return groups
    .map((group) => group.filter((id) => id !== tabId))
    .filter((group) => group.length > 1)
}

export function groupChatPanel(
  groups: string[][],
  validIds: string[],
  tabId: string,
  anchorId: string,
  side: 'left' | 'right' = 'right',
) {
  if (tabId === anchorId || !validIds.includes(tabId) || !validIds.includes(anchorId)) return groups
  const valid = groups.map((group) => group.filter((id) => validIds.includes(id)))
  const anchorGroup = valid.find((group) => group.includes(anchorId)) ?? []
  const next = addChatPanel(anchorGroup, validIds, tabId, anchorId, side)
  const others = valid
    .filter((group) => group !== anchorGroup)
    .map((group) => group.filter((id) => id !== tabId))
    .filter((group) => group.length > 1)
  return [...others, next]
}

export function addChatPanel(
  panels: string[],
  validIds: string[],
  tabId: string,
  anchorId: string,
  side: 'left' | 'right' = 'right',
) {
  if (!validIds.includes(tabId) || !validIds.includes(anchorId)) return panels
  const valid = panels.filter((id) => validIds.includes(id))
  const anchored = valid.includes(anchorId) ? valid : [...valid, anchorId]
  if (tabId === anchorId) return anchored
  const others = anchored.filter((id) => id !== tabId)
  const index = others.indexOf(anchorId) + (side === 'right' ? 1 : 0)
  return [...others.slice(0, index), tabId, ...others.slice(index)]
}
