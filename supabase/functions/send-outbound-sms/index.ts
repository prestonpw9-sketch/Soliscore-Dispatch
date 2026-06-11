// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Required to let your Vercel frontend talk to this function without getting blocked
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Catch the phone number and message sent from your dashboard
    const { phone, message } = await req.json()

    // 2. Grab your secure keys from the Supabase vault
    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER') // Your Solidcore Twilio Number

    // 3. Format the data exactly how Twilio demands it
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
    const formData = new URLSearchParams()
    formData.append('To', phone)
    formData.append('From', TWILIO_PHONE!)
    formData.append('Body', message)

    // 4. Fire the actual blast to Twilio's API
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
      },
      body: formData
    })

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})