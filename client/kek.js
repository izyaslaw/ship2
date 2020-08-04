n = 40;

let str = '~'.repeat(n);

let map = [];
for (let i=0; i<n; i++) {
    map.push(str)
}

map = map.join('\n');

let ports = [
    {
        portId: 0,
        x: 13,
        y: 4,
        isHome: true,
    },
    {
        portId: 1,
        x: 3,
        y: 2,
        isHome: false,
    },
    {
        portId: 2,
        x: 20,
        y: 8,
        isHome: false,
    },
    {
        portId: 3,
        x: 31,
        y: 16,
        isHome: false,
    },
    {
        portId: 3,
        x: 1,
        y: 38,
        isHome: false,
    }
];

for (let port of ports) {
    map = map.split('');
    port.isHome ? map[port.y*n + port.y + port.x] = 'H' : map[port.y*n + port.y + port.x] = 'O';
    map = map.join('')
}

console.log(map);

