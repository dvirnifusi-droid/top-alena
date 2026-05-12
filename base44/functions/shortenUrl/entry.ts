Deno.serve(async (req) => {
  try {
    const { url } = await req.json();
    if (!url) {
      return Response.json({ error: 'URL required' }, { status: 400 });
    }

    // is.gd simple GET API
    const apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl, {
      headers: { 'Accept': 'text/plain' }
    });
    const text = await response.text();
    console.log('is.gd response:', text);

    if (text && text.startsWith('http') && !text.includes('Error')) {
      return Response.json({ shortUrl: text.trim() });
    }

    return Response.json({ shortUrl: url });
  } catch (error) {
    console.error('Shorten error:', error.message);
    return Response.json({ shortUrl: url });
  }
});