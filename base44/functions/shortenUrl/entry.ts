Deno.serve(async (req) => {
  try {
    const { url } = await req.json();
    if (!url) {
      return Response.json({ error: 'URL required' }, { status: 400 });
    }

    const response = await fetch('https://tinyurl.com/api/create.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url })
    });

    const shortUrl = await response.text();
    return Response.json({ shortUrl: shortUrl.trim() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});