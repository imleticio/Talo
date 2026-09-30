function localTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function AnimatedWord({ word, start }: { word: string; start: number }) {
  return (
    <span className="chat-welcome-word" aria-hidden="true">
      {Array.from(word).map((letter, index) => (
        <span
          key={index}
          className="chat-welcome-letter"
          style={{ animationDelay: `${(start + index) * 20}ms` }}
        >
          {letter}
        </span>
      ))}
    </span>
  )
}

export function ChatWelcome() {
  const timeOfDay = localTimeOfDay()

  return (
    <div className="chat-welcome pointer-events-none">
      <h1 aria-label={`Good ${timeOfDay}`}>
        <AnimatedWord word="Good" start={0} /> <AnimatedWord word={timeOfDay} start={5} />
      </h1>
      <p>What would you like to do?</p>
    </div>
  )
}
