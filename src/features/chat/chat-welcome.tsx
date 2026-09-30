import type { CSSProperties } from 'react'

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
          style={
            {
              animationDelay: `${(start + index) * 16}ms`,
              '--haze-letter-offset': `${-(start + index) * 18}px`,
            } as CSSProperties
          }
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
    <header className="chat-welcome">
      <p className="chat-welcome-greeting">Good {timeOfDay}</p>
      <h1 aria-label="Make room for what’s next.">
        <span className="chat-welcome-phrase">
          <AnimatedWord word="Make" start={0} /> <AnimatedWord word="room" start={5} />{' '}
          <AnimatedWord word="for" start={10} />
        </span>
        <span className="chat-welcome-phrase chat-welcome-accent">
          <AnimatedWord word="what’s" start={13} /> <AnimatedWord word="next." start={20} />
        </span>
      </h1>
    </header>
  )
}
