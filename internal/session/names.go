package session

import (
	"crypto/rand"
	"errors"
	"math/big"
)

// ErrNoAvailableNames is returned when all names in the pool are in use.
var ErrNoAvailableNames = errors.New("no available names. Please destroy unused sandboxes with 'sandctl destroy <name>'")

// maxRetries is the number of attempts to find an available name before giving up.
const maxRetries = 10

// namePool contains 250 curated human first names.
// Names are lowercase, 2-15 characters, easy to spell and type.
var namePool = []string{
	"adam", "alex", "alice", "amber", "amy",
	"andrew", "angela", "anna", "anthony", "ashley",
	"austin", "bailey", "barbara", "ben", "beth",
	"blake", "brandon", "brian", "brooke", "bruce",
	"cameron", "carl", "carlos", "carol", "casey",
	"charles", "chelsea", "chris", "claire", "clark",
	"colin", "connor", "craig", "crystal", "daniel",
	"david", "dean", "denise", "derek", "diana",
	"diego", "donna", "douglas", "dylan", "edward",
	"elena", "elijah", "elizabeth", "emily", "emma",
	"eric", "ethan", "evan", "faith", "felix",
	"fernando", "finn", "frank", "gabriel", "gary",
	"george", "grace", "graham", "grant", "greg",
	"hailey", "hannah", "harold", "harry", "heather",
	"henry", "holly", "ian", "iris", "isaac",
	"ivan", "jack", "jacob", "james", "jane",
	"jason", "jay", "jennifer", "jeremy", "jesse",
	"jessica", "jill", "jimmy", "joan", "joe",
	"john", "jordan", "joseph", "joshua", "juan",
	"julia", "julian", "julie", "justin", "karen",
	"kate", "katherine", "keith", "kelly", "kenneth",
	"kevin", "kim", "kyle", "lance", "laura",
	"lauren", "lawrence", "leo", "leon", "leslie",
	"liam", "lily", "linda", "lisa", "logan",
	"louis", "lucas", "lucy", "luis", "luke",
	"madison", "maggie", "marcus", "margaret", "maria",
	"mark", "martin", "mary", "mason", "matthew",
	"max", "megan", "melissa", "michael", "michelle",
	"miguel", "mike", "miles", "mitchell", "molly",
	"monica", "morgan", "nancy", "natalie", "nathan",
	"neil", "nicholas", "nicole", "noah", "nolan",
	"oliver", "olivia", "oscar", "owen", "pamela",
	"patricia", "patrick", "paul", "peter", "philip",
	"rachel", "ralph", "randy", "raymond", "rebecca",
	"richard", "rick", "robert", "robin", "roger",
	"ronald", "rose", "roy", "ruby", "russell",
	"ruth", "ryan", "sally", "sam", "samantha",
	"sandra", "sara", "sarah", "scott", "sean",
	"seth", "shane", "shannon", "sharon", "shawn",
	"sheila", "simon", "sofia", "sophia", "spencer",
	"stephanie", "stephen", "steve", "steven", "stuart",
	"susan", "sydney", "taylor", "teresa", "terry",
	"thomas", "timothy", "tina", "todd", "tom",
	"tony", "tracy", "travis", "trevor", "tyler",
	"vanessa", "victor", "victoria", "vincent", "walter",
	"wayne", "wendy", "wesley", "william", "wyatt",
	"xavier", "zachary", "zoe", "adrian", "aiden",
	"alan", "albert", "alexander", "alexis", "alicia",
	"allison", "amanda", "andre", "andrea", "angel",
	"anne", "april", "arthur", "audrey", "autumn",
}

// GetRandomName selects a random name from the pool that is not in the usedNames list.
// It will retry up to maxRetries times if a collision occurs.
// Returns ErrNoAvailableNames if no available name can be found.
func GetRandomName(usedNames []string) (string, error) {
	// Build a set of used names for O(1) lookup
	usedSet := make(map[string]bool, len(usedNames))
	for _, name := range usedNames {
		usedSet[NormalizeName(name)] = true
	}

	// If all names are used, return error
	if len(usedSet) >= len(namePool) {
		return "", ErrNoAvailableNames
	}

	poolSize := big.NewInt(int64(len(namePool)))

	for attempt := 0; attempt < maxRetries; attempt++ {
		// Generate a random index
		idx, err := rand.Int(rand.Reader, poolSize)
		if err != nil {
			return "", err
		}

		name := namePool[idx.Int64()]
		if !usedSet[name] {
			return name, nil
		}
	}

	// If we exhausted retries, try to find any available name
	for _, name := range namePool {
		if !usedSet[name] {
			return name, nil
		}
	}

	return "", ErrNoAvailableNames
}

// NamePoolSize returns the total number of names in the pool.
func NamePoolSize() int {
	return len(namePool)
}
