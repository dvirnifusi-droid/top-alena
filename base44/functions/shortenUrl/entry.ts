Deno.serve(async (req) => {
  try {
    const { url } = await req.json();
    if (!url) {
      return Response.json({ error: 'URL required' }, { status: 400 });
    }

    // Use is.gd for shorter URLs
    const response = await fetch(`https://is.gd/?url=${encodeURIComponent(url)}&format=json`);
    const data = await response.json();
    
    if (data.shorturl) {
      return Response.json({ shortUrl: data.shorturl });
    }
    
    return Response.json({ shortUrl: url });
  } catch (error) {
    console.error('Shorten error:', error);
    return Response.json({ shortUrl: url }, { status: 200 });
  }
});