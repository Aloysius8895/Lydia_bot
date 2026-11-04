import net from 'node:net';

/** Browser fallback transport: deny every byte stream; never resolve or connect to a destination. */
export async function denyProxy(){
 const sockets=new Set<net.Socket>();let denied=0;
 const server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.setTimeout(2000,()=>socket.destroy());socket.once('data',()=>{denied++;socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');});});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:`http://127.0.0.1:${(server.address() as net.AddressInfo).port}`,denied:()=>denied,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}};
}
