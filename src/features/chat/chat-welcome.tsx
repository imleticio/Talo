function localTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export function ChatWelcome() {
  return (
    <div className="chat-welcome pointer-events-none">
      <h1>Good {localTimeOfDay()}</h1>
      <p>What would you like to do?</p>
    </div>
  )
}
