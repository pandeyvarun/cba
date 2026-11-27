// No credentials or model calls are needed for local readiness.
try {
 const response=await fetch(`http://127.0.0.1:${process.env.PORT||8080}/api/ready`,{signal:AbortSignal.timeout(3500)});
 if(!response.ok)process.exit(1);
 const body=await response.json();
 if(body.status!=='ready'||body.engine!=='DuckDB'||body.taxonomyValid!==true)process.exit(1);
} catch { process.exit(1); }
