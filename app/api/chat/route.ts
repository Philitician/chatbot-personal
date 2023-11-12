// import 'server-only'
import OpenAI, { ClientOptions } from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/lib/db_types'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'
import { get } from '@vercel/edge-config'
import {
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions'

const configuration = {
  apiKey: process.env.OPENAI_API_KEY || ''
} satisfies ClientOptions

const openai = new OpenAI(configuration)

export const runtime = 'edge'

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore
  })
  const json = await req.json()
  const messages = json.messages as ChatCompletionMessageParam[]
  console.log({ messages })

  const user = (await auth({ cookieStore }))?.user
  const userId = user?.id
  const userEmail = user?.email

  if (!userId || !userEmail) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const whitelistedEmails = await get<string>('whitelist')
  if (whitelistedEmails && !whitelistedEmails.includes(userEmail)) {
    return new Response('Email is not whitelisted', {
      status: 401
    })
  }

  const previewToken = json.previewToken as string
  if (previewToken) {
    configuration.apiKey = previewToken
  }

  const res = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    // model: process.env.OPENAI_MODEL || 'gpt-4-1106-preview',
    messages,
    temperature: 0.7,
    stream: true
  })

  const stream = OpenAIStream(res, {
    async onCompletion(completion) {
      const userTextContent = (
        messages[0].content as ChatCompletionContentPart[]
      ).find(x => x.type === 'text') as ChatCompletionContentPartText
      const title = userTextContent.text.substring(0, 100)
      const id = json.id ?? nanoid()
      const createdAt = Date.now()
      const path = `/chat/${id}`
      const payload = {
        id,
        title,
        userId,
        createdAt,
        path,
        messages: [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ] satisfies ChatCompletionMessageParam[]
      }
      // Insert chat into database.
      await supabase
        .from('chats')
        .upsert({ id, payload, user_id: userId })
        .throwOnError()
    }
  })

  // Respond with the stream
  return new StreamingTextResponse(stream)
}
