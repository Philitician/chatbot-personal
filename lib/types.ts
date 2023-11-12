import { type Message } from 'ai'
import { ChatCompletionContentPart } from 'openai/resources'

// TODO refactor and remove unneccessary duplicate data.
export interface Chat extends Record<string, any> {
  id: string
  title: string
  createdAt: Date
  userId: string
  path: string
  messages: Message[]
  sharePath?: string // Refactor to use RLS
}

export type ServerActionResult<Result> = Promise<
  | Result
  | {
      error: string
    }
>

export type UserMessage = Omit<Message, "role" | "content"> & {
  role: "user",
  content: Array<ChatCompletionContentPart>
}